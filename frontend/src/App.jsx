import { useEffect, useState } from "react";

const api = {
  meta: "/api/meta",
  predict: "/api/predict",
};

const initialForm = {
  capRound: "CAP Round I",
  percentile: "",
  categoryGroup: "",
  location: "All",
  seatGroup: "All",
  homeUniversity: "All",
  branchSearch: "",
  collegeSearch: "",
  resultLimit: "50",
};

const categoryLabels = {
  OPEN: "Open",
  OBC: "OBC",
  SC: "SC",
  ST: "ST",
  SEBC: "SEBC",
  EWS: "EWS",
  VJ: "VJ",
  NT1: "NT1",
  NT2: "NT2",
  NT3: "NT3",
  TFWS: "TFWS",
  ORPHAN: "Orphan",
  PWD: "PWD",
  DEFENCE: "Defence",
};

const defaultCategoryGroups = [
  "OPEN",
  "OBC",
  "SC",
  "ST",
  "SEBC",
  "EWS",
  "VJ",
  "NT1",
  "NT2",
  "NT3",
  "TFWS",
  "ORPHAN",
  "PWD",
  "DEFENCE",
];

function badgeTone(chance) {
  if (chance === "Safe") return "bg-emerald-100 text-emerald-700";
  if (chance === "Target") return "bg-amber-100 text-amber-700";
  return "bg-rose-100 text-rose-700";
}

export default function App() {
  const [filters, setFilters] = useState({
    availableRounds: ["CAP Round I", "CAP Round II"],
    categoryGroups: defaultCategoryGroups,
    branches: [],
    branchOptions: [],
    locations: [],
    seatGroups: [],
    homeUniversities: [],
  });
  const [metadata, setMetadata] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [results, setResults] = useState([]);
  const [summary, setSummary] = useState({ safe: 0, target: 0, dream: 0, total: 0 });
  const [totalAvailable, setTotalAvailable] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Loading cutoff data...");

  useEffect(() => {
    async function loadMeta(round) {
      try {
        const response = await fetch(`${api.meta}?round=${encodeURIComponent(round)}`);
        const data = await response.json();
        setFilters({
          availableRounds: data.availableRounds || ["CAP Round I", "CAP Round II"],
          categoryGroups: data.filters.categoryGroups?.length
            ? data.filters.categoryGroups
            : defaultCategoryGroups,
          branches: data.filters.branches || [],
          branchOptions: data.filters.branchOptions || [],
          locations: data.filters.locations || [],
          seatGroups: data.filters.seatGroups || [],
          homeUniversities: data.filters.homeUniversities || [],
        });
        setMetadata(data.metadata);
        setForm((current) => ({
          ...current,
          capRound: round,
          categoryGroup: data.filters.categoryGroups?.[0] || "OPEN",
        }));
        setStatus("Enter your details and click predict.");
      } catch {
        setError("Backend not connected. Start the backend server and refresh.");
        setStatus("Could not load data.");
        setForm((current) => ({
          ...current,
          categoryGroup: current.categoryGroup || "OPEN",
        }));
      } finally {
        setLoading(false);
      }
    }

    loadMeta(form.capRound || "CAP Round I");
  }, [form.capRound]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch(api.predict, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "Prediction failed.");
      }

      setResults(data.matches);
      setSummary(data.summary);
      setTotalAvailable(data.totalAvailable || data.summary.total || 0);
      setStatus(
        data.matches.length
          ? `Showing ${data.matches.length} of ${data.totalAvailable || data.matches.length} matching results for your profile.`
          : "No colleges matched. Try broader filters."
      );
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-6 rounded-[28px] bg-gradient-to-r from-slate-900 via-blue-900 to-cyan-700 px-6 py-8 text-white shadow-soft lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-100">
            MHT CET Predictor
          </p>
          <h1 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">
            College prediction based on your percentile, category, and preferences.
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-200 sm:text-base">
            Official CAP Round I cutoff data converted into a searchable predictor using percentile-gap recommendations.
          </p>
        </header>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-soft">
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">Student Inputs</h2>
              <p className="mt-1 text-sm text-slate-500">{status}</p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-slate-600">
              <TopStat label="Records" value={metadata ? metadata.record_count.toLocaleString() : "Loading"} />
              <TopStat
                label="Programs"
                value={metadata ? metadata.program_section_count.toLocaleString() : "Loading"}
              />
              <TopStat label="Round" value={metadata?.cap_round || "Loading"} />
              <TopStat label="Available" value={totalAvailable ? totalAvailable.toLocaleString() : "0"} />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Percentile">
              <input
                className="field-input light"
                name="percentile"
                type="number"
                min="0"
                max="100"
                step="0.0001"
                placeholder="92.45"
                value={form.percentile}
                onChange={handleChange}
                required
              />
            </Field>

            <Field label="CAP Round">
              <select
                className="field-input light"
                name="capRound"
                value={form.capRound}
                onChange={handleChange}
              >
                {filters.availableRounds.map((round) => (
                  <option key={round} value={round}>
                    {round}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Category">
              <select
                className="field-input light"
                name="categoryGroup"
                value={form.categoryGroup}
                onChange={handleChange}
                required
              >
                {filters.categoryGroups.map((category) => (
                  <option key={category} value={category}>
                    {categoryLabels[category] || category}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Seat group">
              <select className="field-input light" name="seatGroup" value={form.seatGroup} onChange={handleChange}>
                <option value="All">All seat groups</option>
                {filters.seatGroups.map((seatGroup) => (
                  <option key={seatGroup} value={seatGroup}>
                    {seatGroup}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Location">
              <select className="field-input light" name="location" value={form.location} onChange={handleChange}>
                <option value="All">All locations</option>
                {filters.locations.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Home university">
              <select
                className="field-input light"
                name="homeUniversity"
                value={form.homeUniversity}
                onChange={handleChange}
              >
                <option value="All">All universities</option>
                {filters.homeUniversities.map((homeUniversity) => (
                  <option key={homeUniversity} value={homeUniversity}>
                    {homeUniversity}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Preferred branch">
              <select
                className="field-input light"
                name="branchSearch"
                value={form.branchSearch}
                onChange={handleChange}
              >
                <option value="">All branches</option>
                {filters.branchOptions.map((branch) => (
                  <option key={branch} value={branch}>
                    {branch}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Preferred college">
              <input
                className="field-input light"
                name="collegeSearch"
                placeholder="COEP, VIT Pune..."
                value={form.collegeSearch}
                onChange={handleChange}
              />
            </Field>

            <Field label="Result limit">
              <select className="field-input light" name="resultLimit" value={form.resultLimit} onChange={handleChange}>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </Field>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={submitting || loading}
                className="h-12 w-full rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {submitting ? "Predicting..." : "Predict Colleges"}
              </button>
            </div>
          </form>

          {error ? <p className="mt-4 text-sm font-medium text-rose-600">{error}</p> : null}
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Safe" value={summary.safe} tone="bg-emerald-50 text-emerald-700" />
          <SummaryCard label="Target" value={summary.target} tone="bg-amber-50 text-amber-700" />
          <SummaryCard label="Dream" value={summary.dream} tone="bg-rose-50 text-rose-700" />
          <SummaryCard label="Total Matches" value={summary.total} tone="bg-blue-50 text-blue-700" />
        </section>

        <section className="mt-6 rounded-[28px] border border-slate-200 bg-white shadow-soft">
          <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
            <h2 className="text-2xl font-semibold text-slate-900">College List</h2>
            <p className="mt-1 text-sm text-slate-500">
              Results are ranked by percentile-gap recommendation: Safe, Target, then Dream.
            </p>
          </div>

          <div className="divide-y divide-slate-200">
            {results.length ? (
              results.map((result) => (
                <article
                  key={`${result.program_code}-${result.category}-${result.seat_group}-${result.page_number}`}
                  className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[1.5fr_1.2fr_0.8fr]"
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeTone(result.chance)}`}>
                        {result.chance}
                      </span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                        {result.category}
                      </span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                        {result.stage}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-xl font-semibold text-slate-900">{result.institute_name}</h3>
                      <p className="mt-1 text-sm font-medium text-blue-700">{result.program_name}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <InfoBox label="Seat group" value={result.seat_group} />
                    <InfoBox label="University" value={result.home_university} />
                    <InfoBox label="Status" value={result.status} />
                    <InfoBox label="Cutoff" value={result.cutoff_percentile.toFixed(4)} />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    <Metric label="Your gap" value={`+${result.percentile_gap.toFixed(4)}`} />
                    <Metric label="Program code" value={result.program_code} />
                  </div>
                </article>
              ))
            ) : (
              <div className="px-6 py-16 text-center text-slate-500">
                {loading ? "Loading cutoff data..." : "No predictions yet. Fill the inputs above and click Predict Colleges."}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span className="field-label light">{label}</span>
      {children}
    </label>
  );
}

function TopStat({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-100 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function SummaryCard({ label, value, tone }) {
  return (
    <div className={`rounded-2xl p-5 ${tone}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.24em]">{label}</p>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function InfoBox({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm leading-6 text-slate-700">{value}</p>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
