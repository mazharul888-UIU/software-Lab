const clampPercentage = (value) => Math.min(100, Math.max(0, Number(value) || 0));

function parseCareerInterests(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function calculateProfileCompletion(profile = {}) {
  const skills = Array.isArray(profile.skills)
    ? profile.skills
    : parseCareerInterests(profile.skills);
  const completedFields = [
    profile.name,
    profile.email,
    profile.university,
    profile.degree,
    profile.graduation_year,
    profile.target_role,
    profile.location,
    parseCareerInterests(profile.career_interests).length,
    skills.length,
  ].filter((value) => value !== null && value !== undefined && String(value).trim() !== "").length;

  return Math.round((completedFields / 9) * 100);
}

function calculateReadiness({
  profileCompletion = 0,
  assessmentPerformance = 0,
  learningProgress = 0,
} = {}) {
  const profile = clampPercentage(profileCompletion);
  const assessments = clampPercentage(assessmentPerformance);
  const learning = clampPercentage(learningProgress);

  return Math.round((profile * 0.35) + (assessments * 0.45) + (learning * 0.20));
}

function average(values = []) {
  const numbers = values
    .map(Number)
    .filter((value) => Number.isFinite(value));
  if (!numbers.length) return 0;
  return Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length);
}

function calculateResumeCompletion(resume = {}) {
  const fields = [
    resume.name,
    resume.title,
    resume.email,
    resume.phone,
    resume.location,
    resume.summary,
    resume.skills,
    Array.isArray(resume.education) && resume.education.length,
    Array.isArray(resume.experiences) && resume.experiences.length,
    Array.isArray(resume.projects) && resume.projects.length,
  ];
  const completedSections = fields.filter((value) => {
    if (typeof value === "number") return value > 0;
    return value !== null && value !== undefined && String(value).trim() !== "";
  }).length;
  return {
    percentage: Math.round((completedSections / fields.length) * 100),
    completedSections,
    totalSections: fields.length,
  };
}

module.exports = {
  average,
  calculateProfileCompletion,
  calculateReadiness,
  calculateResumeCompletion,
  clampPercentage,
  parseCareerInterests,
};
