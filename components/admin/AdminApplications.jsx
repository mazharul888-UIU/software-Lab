import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  LoaderCircle,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { apiDownload, apiRequest } from "../../lib/api";

const statuses = ["applied", "in_review", "assessment", "interview", "offer", "rejected", "withdrawn"];

const statusStyle = {
  applied: "bg-cobalt/10 text-cobalt",
  in_review: "bg-plum/10 text-plum",
  assessment: "bg-[#A57945]/10 text-[#A57945]",
  interview: "bg-coral/10 text-coral",
  offer: "bg-jade/10 text-jade",
  rejected: "bg-coral/10 text-coral",
  withdrawn: "bg-ink/10 text-muted",
};

const statusLabel = (value) => String(value || "applied").replace("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const parseSnapshot = (value) => {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const list = (value) => Array.isArray(value) ? value : [];
const lines = (value) => String(value || "").split("\n").map((item) => item.trim()).filter(Boolean);
const initials = (name) => String(name || "Applicant").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

function Metric({ label, value, icon: Icon, tone, note }) {
  return <div className="panel flex items-center gap-4 p-4"><span className={`grid h-11 w-11 place-items-center rounded-2xl text-white ${tone}`}><Icon size={18} /></span><span><b className="block text-xl">{value}</b><small className="block text-[10px] font-bold text-muted">{label}</small><small className="text-[9px] text-muted">{note}</small></span></div>;
}

function ResumeSection({ title, children }) {
  return <section><h3 className="mb-3 text-[10px] font-extrabold uppercase tracking-[.16em] text-coral">{title}</h3>{children}</section>;
}

function ResumeEntry({ title, subtitle, date, details }) {
  return <div className="mb-5 last:mb-0"><div className="flex items-start justify-between gap-4"><div><b className="text-xs">{title}</b>{subtitle && <p className="mt-1 text-[10px] text-muted">{subtitle}</p>}</div>{date && <small className="shrink-0 text-[9px] font-bold text-muted">{date}</small>}</div>{details.length > 0 && <ul className="mt-2 space-y-1">{details.map((point, index) => <li className="flex gap-2 text-[10px] leading-5 text-muted" key={`${point}-${index}`}><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-cobalt" />{point}</li>)}</ul>}</div>;
}

function ApplicantModal({ application, onClose, onStatusChanged, notify }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusSaving, setStatusSaving] = useState(false);
  const [error, setError] = useState("");
  const snapshot = parseSnapshot(detail?.resume_snapshot);

  useEffect(() => {
    apiRequest(`/admin/applications/${application.id}`)
      .then(setDetail)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [application.id]);

  useEffect(() => {
    document.documentElement.classList.add("applicant-cv-modal-open");
    return () => document.documentElement.classList.remove("applicant-cv-modal-open");
  }, []);

  const changeStatus = async (status) => {
    setStatusSaving(true);
    try {
      await apiRequest(`/admin/applications/${application.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setDetail((current) => ({ ...current, status }));
      await onStatusChanged();
      notify("Application status updated.");
    } catch (requestError) {
      notify(requestError.message);
    } finally {
      setStatusSaving(false);
    }
  };

  const openUploadedResume = async () => {
    try {
      const { blob } = await apiDownload(`/admin/applications/${application.id}/resume-file`);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (requestError) {
      notify(requestError.message);
    }
  };

  return (
    <div className="modal-backdrop applicant-cv-backdrop" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Applicant CV preview" className="modal-card applicant-cv-modal max-w-6xl overflow-hidden" onClick={(event) => event.stopPropagation()}>
        <div className="applicant-cv-header shrink-0 flex flex-wrap items-start justify-between gap-4 border-b border-ink/[0.08] pb-4">
          <div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-cobalt text-xs font-extrabold text-white">{initials(application.applicant_name)}</span><div><span className="eyebrow">Application #{application.id}</span><h2 className="mt-1 text-xl font-extrabold">{application.applicant_name}</h2><p className="text-xs text-muted">{application.job_title} · {application.company_name}</p></div></div>
          <div className="flex items-center gap-2">
            {detail?.has_resume_file && <button onClick={openUploadedResume} className="btn-secondary"><Download size={15} /> Open uploaded CV</button>}
            <button type="button" onClick={onClose} className="btn-secondary min-h-10" aria-label="Close applicant CV and return to applications" title="Back to applications"><X size={18} /> <span>Back to applications</span></button>
          </div>
        </div>

        <div className="applicant-cv-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
        {loading && <div className="grid min-h-80 place-items-center text-center text-xs text-muted"><span><LoaderCircle className="mx-auto mb-3 animate-spin text-plum" size={25} />Loading applicant and CV...</span></div>}
        {!loading && error && <div className="my-8 rounded-2xl bg-coral/10 p-5 text-sm font-bold text-coral"><AlertTriangle className="mr-2 inline" size={17} />{error}</div>}
        {!loading && detail && (
          <>
            <section className="mt-6 grid gap-3 rounded-[24px] bg-ink/[0.035] p-4 sm:grid-cols-2 xl:grid-cols-5 dark:bg-white/[0.04]">
              <div><small className="text-[9px] font-extrabold uppercase text-muted">Email</small><p className="mt-1 break-all text-xs font-bold">{detail.applicant_email}</p></div>
              <div><small className="text-[9px] font-extrabold uppercase text-muted">University</small><p className="mt-1 text-xs font-bold">{detail.university || "Not provided"}</p></div>
              <div><small className="text-[9px] font-extrabold uppercase text-muted">Applied</small><p className="mt-1 text-xs font-bold">{new Date(detail.applied_at).toLocaleString()}</p></div>
              <div><small className="text-[9px] font-extrabold uppercase text-muted">Readiness</small><p className="mt-1 text-xs font-bold">{Number(detail.readiness_score || 0)}%</p></div>
              <label><small className="text-[9px] font-extrabold uppercase text-muted">Pipeline status</small><select disabled={detail.status === "withdrawn" || statusSaving} value={detail.status} onChange={(event) => changeStatus(event.target.value)} className="select mt-1 min-h-9 py-1 text-xs">{statuses.map((status) => <option disabled={status === "withdrawn"} value={status} key={status}>{statusLabel(status)}</option>)}</select></label>
            </section>

            <div className="mt-6 grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
              <article id="resume-print" className="resume-paper min-h-[760px] rounded-[8px] bg-white p-8 text-ink shadow-lift sm:p-10">
                {snapshot ? (
                  <>
                    <header className="border-b-2 border-ink pb-6"><h1 className="font-display text-4xl tracking-[-0.04em]">{snapshot.name || detail.applicant_name}</h1>{snapshot.title && <p className="mt-2 text-xs font-extrabold uppercase tracking-[.12em] text-cobalt">{snapshot.title}</p>}<div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-semibold text-muted">{[snapshot.email || detail.applicant_email, snapshot.phone || detail.phone, snapshot.location || detail.location, snapshot.website].filter(Boolean).map((item) => <span key={item}>{item}</span>)}</div></header>
                    <div className="grid gap-8 pt-6 sm:grid-cols-[.34fr_.66fr]">
                      <aside className="space-y-7">
                        {snapshot.skills && <ResumeSection title="Expertise"><div className="flex flex-wrap gap-1.5">{String(snapshot.skills).split(",").map((skill) => skill.trim()).filter(Boolean).map((skill) => <span className="rounded-md bg-canvas px-2 py-1 text-[9px] font-bold" key={skill}>{skill}</span>)}</div></ResumeSection>}
                        {list(snapshot.education).length > 0 && <ResumeSection title="Education">{list(snapshot.education).map((item, index) => <ResumeEntry key={item.id || index} title={item.degree || "Qualification"} subtitle={[item.institution, item.location].filter(Boolean).join(" · ")} date={[item.start, item.end].filter(Boolean).join(" — ")} details={[]} />)}</ResumeSection>}
                        {list(snapshot.languages).length > 0 && <ResumeSection title="Languages">{list(snapshot.languages).map((item, index) => <p className="mb-1 text-[10px]" key={item.id || index}><b>{item.name}</b>{item.proficiency && <span className="text-muted"> · {item.proficiency}</span>}</p>)}</ResumeSection>}
                        {list(snapshot.certifications).length > 0 && <ResumeSection title="Certifications">{list(snapshot.certifications).map((item, index) => <ResumeEntry key={item.id || index} title={item.name || "Certification"} subtitle={item.issuer} date={item.date} details={item.credential ? [item.credential] : []} />)}</ResumeSection>}
                      </aside>
                      <div className="space-y-7">
                        {snapshot.summary && <ResumeSection title="Profile"><p className="whitespace-pre-line text-[10px] leading-5 text-muted">{snapshot.summary}</p></ResumeSection>}
                        {list(snapshot.experiences).length > 0 && <ResumeSection title="Experience">{list(snapshot.experiences).map((item, index) => <ResumeEntry key={item.id || index} title={item.title || "Position"} subtitle={[item.company, item.location].filter(Boolean).join(" · ")} date={[item.start, item.end].filter(Boolean).join(" — ")} details={lines(item.details)} />)}</ResumeSection>}
                        {list(snapshot.projects).length > 0 && <ResumeSection title="Selected projects">{list(snapshot.projects).map((item, index) => <ResumeEntry key={item.id || index} title={item.title || "Project"} subtitle={[item.context, item.link].filter(Boolean).join(" · ")} date={item.date} details={lines(item.details)} />)}</ResumeSection>}
                        {!snapshot.summary && !list(snapshot.experiences).length && !list(snapshot.projects).length && <div className="rounded-2xl border border-dashed border-ink/15 p-8 text-center"><FileText className="mx-auto text-muted" /><b className="mt-3 block text-sm">CV snapshot is mostly empty</b><p className="mt-1 text-[10px] text-muted">The student had not completed these Career Vault sections when applying.</p></div>}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="grid min-h-[650px] place-items-center text-center"><div><FileText className="mx-auto text-muted" size={34} /><h3 className="mt-4 text-lg font-extrabold">No CV snapshot captured</h3><p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-muted">This application was submitted before CV snapshots were enabled. The applicant profile and uploaded file, if any, remain available.</p></div></div>
                )}
              </article>

              <aside className="space-y-4">
                <section className="panel p-5"><h3 className="text-sm font-extrabold">Applicant profile</h3><div className="mt-4 space-y-3 text-xs">{[[Mail, detail.applicant_email], [Phone, detail.phone || "Phone not provided"], [MapPin, detail.location || "Location not provided"], [UserRound, detail.degree || "Degree not provided"]].map(([Icon, value]) => <div className="flex gap-2 text-muted" key={value}><Icon className="mt-0.5 shrink-0" size={14} /><span>{value}</span></div>)}</div></section>
                <section className="panel p-5"><h3 className="text-sm font-extrabold">Cover letter</h3>{detail.cover_letter ? <p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-muted">{detail.cover_letter}</p> : <p className="mt-3 text-xs text-muted">No cover letter submitted.</p>}</section>
                <section className="panel p-5"><h3 className="text-sm font-extrabold">Submitted CV assets</h3><div className="mt-3 space-y-2 text-xs"><p className="flex items-center justify-between"><span className="text-muted">Career Vault snapshot</span><b>{snapshot ? "Available" : "Unavailable"}</b></p><p className="flex items-center justify-between"><span className="text-muted">Uploaded file</span><b>{detail.has_resume_file ? detail.resume_file_name : "None"}</b></p></div>{detail.has_resume_file && <button onClick={openUploadedResume} className="btn-secondary mt-4 w-full"><Download size={14} /> Open CV file</button>}</section>
              </aside>
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  );
}

export default function AdminApplications({ records, loading, error, onRetry, notify }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);

  const filtered = useMemo(() => records.filter((record) => {
    const match = `${record.applicant_name} ${record.applicant_email} ${record.job_title} ${record.company_name} ${record.university || ""}`.toLowerCase().includes(search.toLowerCase());
    return match && (filter === "all" || record.status === filter);
  }), [filter, records, search]);
  const active = records.filter((record) => !["withdrawn", "rejected"].includes(record.status));
  const withCv = records.filter((record) => Number(record.has_resume_snapshot) === 1 || Number(record.has_resume_file) === 1);

  return (
    <div className="space-y-5">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total applicants" value={records.length} note="real submitted applications" icon={Users} tone="bg-cobalt" />
        <Metric label="Active pipeline" value={active.length} note="excluding cancelled and rejected" icon={BriefcaseBusiness} tone="bg-plum" />
        <Metric label="CV available" value={withCv.length} note="snapshot or uploaded file" icon={FileText} tone="bg-jade" />
        <Metric label="Interview stage" value={records.filter((record) => record.status === "interview").length} note="current interview candidates" icon={CheckCircle2} tone="bg-coral" />
      </section>
      <section className="glass flex flex-col gap-3 rounded-[24px] p-3 lg:flex-row">
        <label className="relative flex-1"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} className="input pl-11" placeholder="Search applicant, email, university, job or company..." /></label>
        <select value={filter} onChange={(event) => setFilter(event.target.value)} className="select lg:w-52"><option value="all">All statuses</option>{statuses.map((status) => <option value={status} key={status}>{statusLabel(status)}</option>)}</select>
        <button onClick={() => onRetry()} className="btn-secondary"><RefreshCw size={14} /> Refresh</button>
      </section>
      <section className="panel p-5">
        <div className="mb-5"><h2 className="text-lg font-extrabold">Who applied</h2><p className="text-xs text-muted">Applicant identity, submitted CV and pipeline status from real application records.</p></div>
        {loading && <div className="grid min-h-64 place-items-center text-center text-xs text-muted"><span><LoaderCircle className="mx-auto mb-3 animate-spin text-plum" />Loading applicants...</span></div>}
        {!loading && error && <div className="grid min-h-64 place-items-center text-center"><span><AlertTriangle className="mx-auto text-coral" /><b className="mt-3 block">Could not load applicants</b><small className="text-muted">{error}</small><button onClick={() => onRetry()} className="btn-secondary mt-4"><RefreshCw size={14} /> Try again</button></span></div>}
        {!loading && !error && !filtered.length && <div className="grid min-h-64 place-items-center text-center"><span><Users className="mx-auto text-muted" size={30} /><b className="mt-3 block">{records.length ? "No applicants match these filters" : "No one has applied yet"}</b><small className="text-muted">{records.length ? "Try another search or status." : "Real applicants will appear after students apply to an administrator-published job."}</small></span></div>}
        {!loading && !error && filtered.length > 0 && <div className="table-shell overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-xs"><thead className="border-b border-ink/[0.07] bg-ink/[0.035] text-[10px] uppercase tracking-[.09em] text-muted"><tr>{["Applicant", "University", "Applied for", "Submitted", "CV", "Status", "Action"].map((heading) => <th className="px-4 py-3" key={heading}>{heading}</th>)}</tr></thead><tbody className="divide-y divide-ink/[0.06]">{filtered.map((record) => <tr className="hover:bg-white/55 dark:hover:bg-white/[0.03]" key={record.id}><td className="px-4 py-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cobalt text-[10px] font-extrabold text-white">{initials(record.applicant_name)}</span><span><b className="block">{record.applicant_name}</b><small className="text-muted">{record.applicant_email}</small></span></div></td><td className="px-4 py-4 text-muted">{record.university || "Not provided"}</td><td className="px-4 py-4"><b className="block">{record.job_title}</b><small className="text-muted">{record.company_name}</small></td><td className="px-4 py-4 text-muted">{new Date(record.applied_at).toLocaleDateString()}</td><td className="px-4 py-4">{Number(record.has_resume_file) === 1 ? <span className="tag !bg-jade/10 !text-jade">File + snapshot</span> : Number(record.has_resume_snapshot) === 1 ? <span className="tag !bg-cobalt/10 !text-cobalt">Vault snapshot</span> : <span className="tag">Profile only</span>}</td><td className="px-4 py-4"><span className={`tag ${statusStyle[record.status] || statusStyle.applied}`}>{statusLabel(record.status)}</span></td><td className="px-4 py-4"><button onClick={() => setSelected(record)} className="btn-secondary min-h-9"><Eye size={14} /> View applicant & CV</button></td></tr>)}</tbody></table></div>}
      </section>
      {selected && <ApplicantModal application={selected} onClose={() => setSelected(null)} onStatusChanged={onRetry} notify={notify} />}
    </div>
  );
}
