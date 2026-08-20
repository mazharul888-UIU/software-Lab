import { Link } from "../lib/router";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  FileText,
  MessageCircle,
  Play,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Zap,
} from "lucide-react";
import AdaptiveHeroImage from "./AdaptiveHeroImage";
import { PublicFooter, PublicHeader } from "./public/PublicChrome";
import UniversityMarquee from "./public/UniversityMarquee";

const featureCards = [
  {
    icon: Target,
    tone: "clay-cobalt",
    number: "01",
    title: "Find your fit",
    copy: "Turn your career interests, target role and skills into explainable job matches.",
    label: "Role signal",
  },
  {
    icon: BarChart3,
    tone: "clay-jade",
    number: "02",
    title: "Build proof",
    copy: "Practice with adaptive assessments that give every skill a measurable next step.",
    label: "Skill signal",
  },
  {
    icon: FileText,
    tone: "clay-coral",
    number: "03",
    title: "Tell your story",
    copy: "Shape your evolving profile into a resume that is ready for a real opportunity.",
    label: "Career Vault",
  },
];

const journey = [
  ["01", "Give your goals a home", "Add the skills, degree, interests and role you are moving toward."],
  ["02", "Make progress visible", "Assessments, projects and applications turn effort into a career signal."],
  ["03", "Take the next right move", "CareerCube surfaces practical actions instead of another generic checklist."],
];

const orbitItems = ["Profile", "Assess", "Match", "Apply"];

export default function LandingPage() {
  return (
    <main className="clay-app noise min-h-screen overflow-hidden">
      <PublicHeader />

      <section className="landing-clay-hero page-shell relative pb-14 pt-8 sm:pb-20 sm:pt-12 lg:pb-24">
        <div className="clay-orb clay-orb-one" aria-hidden="true" />
        <div className="clay-orb clay-orb-two" aria-hidden="true" />
        <div className="clay-grid-pattern" aria-hidden="true" />

        <div className="grid items-center gap-10 lg:grid-cols-[.83fr_1.17fr] lg:gap-8">
          <div className="relative z-10">
            <div className="clay-eyebrow">
              <span className="clay-eyebrow-icon"><Sparkles size={14} /></span>
              Career growth, made tangible
            </div>

            <h1 className="landing-clay-title mt-7">
              Make your next
              <span className="block text-cobalt">move feel real.</span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-7 text-muted sm:text-lg">
              CareerCube gives ambitious students one calm, connected space to understand their strengths, follow the right signal and act with confidence.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/login/student?mode=register" className="clay-primary-cta">
                Start your workspace <ArrowRight size={17} />
              </Link>
              <a href="#journey" className="clay-secondary-cta">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-white"><Play size={12} fill="currentColor" /></span>
                Explore the flow
              </a>
            </div>

            <div className="mt-9 flex flex-wrap gap-3">
              {[
                ["Personalized", "around your goals"],
                ["Actionable", "not overwhelming"],
                ["One workspace", "from skill to job"],
              ].map(([title, copy]) => (
                <div key={title} className="clay-proof-chip">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-jade/15 text-jade"><Check size={13} /></span>
                  <span><b>{title}</b><small>{copy}</small></span>
                </div>
              ))}
            </div>
          </div>

          <div className="landing-clay-visual relative">
            <div className="clay-hero-shell">
              <AdaptiveHeroImage
                alt="A group of university graduates celebrating their next career chapter"
                className="aspect-[1.5/1] w-full"
                imageClassName="object-cover object-center"
              />
            </div>

            <div className="clay-floating-card clay-floating-match" aria-hidden="true">
              <span className="clay-floating-icon bg-cobalt"><Target size={17} /></span>
              <span><small>Role alignment</small><b>94% match</b></span>
              <span className="clay-mini-ring"><i /></span>
            </div>

            <div className="clay-floating-card clay-floating-progress" aria-hidden="true">
              <span className="clay-floating-icon bg-coral"><BarChart3 size={17} /></span>
              <span><small>Growth this month</small><b>+3 stronger signals</b></span>
            </div>

            <div className="clay-floating-path" aria-hidden="true">
              {orbitItems.map((item, index) => <span key={item} className={index === 3 ? "is-active" : ""}>{item}</span>)}
            </div>
          </div>
        </div>
      </section>

      <UniversityMarquee />

      <section id="platform" className="page-shell py-20 sm:py-28">
        <div className="grid gap-8 lg:grid-cols-[.9fr_1.1fr] lg:items-end">
          <div>
            <span className="clay-section-mark"><Zap size={15} /> Your work, connected</span>
            <h2 className="landing-section-title mt-5">A career system that feels <i>human.</i></h2>
          </div>
          <p className="max-w-xl text-base leading-7 text-muted lg:justify-self-end">
            The platform is built to make progress visible. Each feature adds context to the next, so your profile does not sit in one place while your opportunities sit somewhere else.
          </p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {featureCards.map(({ icon: Icon, tone, number, title, copy, label }) => (
            <article key={title} className="clay-feature-card group">
              <div className="flex items-start justify-between">
                <span className={`clay-feature-icon ${tone}`}><Icon size={22} /></span>
                <span className="font-display text-3xl italic text-ink/25">{number}</span>
              </div>
              <p className="mt-10 text-[10px] font-extrabold uppercase tracking-[.17em] text-muted">{label}</p>
              <h3 className="mt-3 text-2xl font-extrabold tracking-[-.045em]">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-muted">{copy}</p>
              <div className="mt-8 flex items-center justify-between border-t border-ink/[.08] pt-4">
                <span className="text-xs font-bold text-muted">Open your signal</span>
                <span className="clay-arrow"><ChevronRight size={16} /></span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="journey" className="landing-flow-section py-20 sm:py-28">
        <div className="page-shell grid gap-10 lg:grid-cols-[.85fr_1.15fr]">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <span className="clay-section-mark"><Sparkles size={15} /> A clearer rhythm</span>
            <h2 className="landing-section-title mt-5">No generic path.<br /><i>A path that reacts.</i></h2>
            <p className="mt-6 max-w-md leading-7 text-muted">
              CareerCube starts from the details you give it, then keeps becoming more useful as you build evidence of what you can do.
            </p>
            <div className="clay-path-orbit mt-9" aria-hidden="true">
              <span className="clay-path-core"><Sparkles size={20} /></span>
              <span className="clay-path-dot dot-one" />
              <span className="clay-path-dot dot-two" />
              <span className="clay-path-dot dot-three" />
              <span className="clay-path-line" />
            </div>
          </div>

          <div className="space-y-4">
            {journey.map(([number, title, copy], index) => (
              <article key={number} className={`clay-journey-card ${index === 1 ? "clay-journey-card-featured" : ""}`}>
                <span className="clay-journey-number">{number}</span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-2xl font-extrabold tracking-[-.04em]">{title}</h3>
                  <p className="mt-2 max-w-lg text-sm leading-6 text-muted">{copy}</p>
                </div>
                <span className="clay-arrow shrink-0"><ArrowRight size={16} /></span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="community" className="page-shell py-20 sm:py-28">
        <div className="grid gap-5 lg:grid-cols-[1.08fr_.92fr]">
          <article className="clay-community-card">
            <div className="relative z-10 max-w-xl">
              <span className="clay-section-mark !text-ink"><MessageCircle size={15} /> Made for momentum</span>
              <h2 className="landing-section-title mt-5">Bring people into the <i>progress.</i></h2>
              <p className="mt-5 max-w-lg leading-7 text-ink/65">Ask a useful question, share an assessment win or find students who are building toward the same role.</p>
              <Link to="/community" className="clay-dark-cta mt-8">Enter the community <ArrowRight size={16} /></Link>
            </div>
            <div className="clay-community-bubbles" aria-hidden="true">
              <span className="bubble-a">+</span><span className="bubble-b"><Users size={24} /></span><span className="bubble-c"><Sparkles size={21} /></span>
            </div>
          </article>

          <div id="resources" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
            <Link to="/resources" className="clay-resource-card group">
              <span className="clay-resource-icon bg-cobalt"><BookOpen size={20} /></span>
              <span className="min-w-0 flex-1"><b>Useful on your actual path</b><small>Resources that support your current focus.</small></span>
              <ChevronRight className="text-muted transition group-hover:translate-x-1 group-hover:text-cobalt" size={18} />
            </Link>
            <Link to="/resources" className="clay-resource-card group">
              <span className="clay-resource-icon bg-coral"><CalendarDays size={20} /></span>
              <span className="min-w-0 flex-1"><b>Events worth showing up for</b><small>Reserve a seat for workshops and career sessions.</small></span>
              <ChevronRight className="text-muted transition group-hover:translate-x-1 group-hover:text-coral" size={18} />
            </Link>
            <Link to="/login/student?mode=register" className="clay-resource-card group">
              <span className="clay-resource-icon bg-jade"><ShieldCheck size={20} /></span>
              <span className="min-w-0 flex-1"><b>One profile, more proof</b><small>Keep your professional story ready to use.</small></span>
              <ChevronRight className="text-muted transition group-hover:translate-x-1 group-hover:text-jade" size={18} />
            </Link>
          </div>
        </div>
      </section>

      <section className="page-shell pb-20 sm:pb-28">
        <div className="landing-clay-cta">
          <div className="relative z-10 max-w-2xl">
            <span className="text-[11px] font-extrabold uppercase tracking-[.18em] text-white/65">Your next chapter is practical</span>
            <h2 className="mt-4 font-display text-5xl leading-[.95] tracking-[-.055em] text-white sm:text-6xl">Turn direction into <i>movement.</i></h2>
            <p className="mt-5 max-w-xl text-sm leading-6 text-white/65">Create a student account, build your signal and make your next application feel much less like a guess.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/login/student?mode=register" className="clay-light-cta">Create free account <ArrowRight size={17} /></Link>
              <Link to="/login/admin" className="clay-outline-cta">Administrator portal</Link>
            </div>
          </div>
          <div className="clay-cta-sphere sphere-one" aria-hidden="true" />
          <div className="clay-cta-sphere sphere-two" aria-hidden="true" />
          <div className="clay-cta-tile" aria-hidden="true"><Target size={36} /></div>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
