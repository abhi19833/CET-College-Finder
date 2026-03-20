import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const datasetFiles = {
  "CAP Round I": path.join(__dirname, "..", "data", "cutoffs_2024_cap1.json"),
  "CAP Round II": path.join(__dirname, "..", "data", "cutoffs_2024_cap2.json"),
  "CAP Round III": path.join(__dirname, "..", "data", "cutoffs_2024_cap3.json"),
};

const categoryGroups = [
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

function loadDataset(dataPath) {
  const raw = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  const records = raw.records.map((record) => ({
    ...record,
    category: record.category.replace(/\s+/g, ""),
  }));

  return {
    raw,
    records,
    filters: {
      categories: [...new Set(records.map((record) => record.category))].sort(),
      categoryGroups,
      branches: [...new Set(records.map((record) => record.program_name))].sort(),
      branchOptions: [...new Set(records.map((record) => record.program_name))].sort(),
      locations: [...new Set(records.map((record) => record.location).filter(Boolean))].sort(),
      seatGroups: [...new Set(records.map((record) => record.seat_group))].sort(),
      homeUniversities: [...new Set(records.map((record) => record.home_university))].sort(),
    },
  };
}

const datasets = Object.fromEntries(
  Object.entries(datasetFiles).map(([round, file]) => [round, loadDataset(file)])
);

function resolveRound(round) {
  if (round && datasets[round]) {
    return round;
  }
  return "CAP Round I";
}

function matchesCategoryGroup(category, categoryGroup) {
  if (!categoryGroup || categoryGroup === "ALL") return true;

  switch (categoryGroup) {
    case "OPEN":
      return category.includes("OPEN");
    case "OBC":
      return category.includes("OBC");
    case "SC":
      return category.includes("SC") && !category.includes("SEBC");
    case "ST":
      return category.includes("ST") && !category.includes("SEBC");
    case "SEBC":
      return category.includes("SEBC");
    case "EWS":
      return category === "EWS";
    case "VJ":
      return category.includes("VJ");
    case "NT1":
      return category.includes("NT1");
    case "NT2":
      return category.includes("NT2");
    case "NT3":
      return category.includes("NT3");
    case "TFWS":
      return category.includes("TFWS");
    case "ORPHAN":
      return category.includes("ORPHAN");
    case "PWD":
      return category.includes("PWD");
    case "DEFENCE":
      return category.startsWith("DEF") || category.includes("DEFR");
    default:
      return true;
  }
}

function classifyChance(gap) {
  if (gap >= 3) return "Safe";
  if (gap >= 1) return "Target";
  return "Dream";
}

function getChancePriority(chance) {
  if (chance === "Dream") return 0;
  if (chance === "Target") return 1;
  return 2;
}

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/meta", (req, res) => {
  const round = resolveRound(req.query.round);
  const dataset = datasets[round];
  res.json({
    metadata: {
      ...dataset.raw.metadata,
      cap_round: dataset.raw.metadata.cap_round || round,
    },
    filters: dataset.filters,
    availableRounds: Object.keys(datasets),
  });
});

app.post("/api/predict", (req, res) => {
  const {
    capRound,
    percentile,
    categoryGroup,
    location,
    seatGroup,
    homeUniversity,
    branchSearch,
    collegeSearch,
    resultLimit = 50,
  } = req.body;

  const round = resolveRound(capRound);
  const dataset = datasets[round];
  const records = dataset.records;

  const numericPercentile = Number(percentile);
  if (Number.isNaN(numericPercentile) || numericPercentile < 0 || numericPercentile > 100) {
    return res.status(400).json({ message: "Percentile must be between 0 and 100." });
  }

  const normalizedCategoryGroup = String(categoryGroup || "").trim().toUpperCase();
  if (!normalizedCategoryGroup) {
    return res.status(400).json({ message: "Category is required." });
  }

  const branchQuery = String(branchSearch || "").trim().toLowerCase();
  const collegeQuery = String(collegeSearch || "").trim().toLowerCase();
  const locationQuery = String(location || "").trim().toLowerCase();

  const matches = records
    .filter((record) => matchesCategoryGroup(record.category, normalizedCategoryGroup))
    .filter(
      (record) =>
        !locationQuery || locationQuery === "all" || record.location.toLowerCase() === locationQuery
    )
    .filter((record) => !seatGroup || seatGroup === "All" || record.seat_group === seatGroup)
    .filter(
      (record) =>
        !homeUniversity ||
        homeUniversity === "All" ||
        record.home_university === homeUniversity
    )
    .filter((record) => !branchQuery || record.program_name.toLowerCase().includes(branchQuery))
    .filter(
      (record) => !collegeQuery || record.institute_name.toLowerCase().includes(collegeQuery)
    )
    .filter((record) => record.cutoff_percentile <= numericPercentile)
    .map((record) => {
      const gap = numericPercentile - record.cutoff_percentile;
      return {
        ...record,
        percentile_gap: Number(gap.toFixed(4)),
        chance: classifyChance(gap),
      };
    });

  const totalAvailable = matches.length;

  const limitedMatches = matches
    .sort((a, b) => {
      const chanceDiff = getChancePriority(a.chance) - getChancePriority(b.chance);
      if (chanceDiff !== 0) {
        return chanceDiff;
      }
      if (b.cutoff_percentile !== a.cutoff_percentile) {
        return b.cutoff_percentile - a.cutoff_percentile;
      }
      if (a.percentile_gap !== b.percentile_gap) {
        return a.percentile_gap - b.percentile_gap;
      }
      return a.institute_name.localeCompare(b.institute_name);
    })
    .slice(0, Number(resultLimit));

  const summary = limitedMatches.reduce(
    (acc, match) => {
      acc.total += 1;
      acc[match.chance.toLowerCase()] += 1;
      return acc;
    },
    { safe: 0, target: 0, dream: 0, total: 0 }
  );

  return res.json({
    summary,
    matches: limitedMatches,
    totalAvailable,
    capRound: round,
  });
});

export default app;
