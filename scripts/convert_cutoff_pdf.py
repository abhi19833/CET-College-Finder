from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import pdfplumber


HEADER_PREFIXES = (
    "D Government of Maharashtra",
    "i State Common Entrance Test Cell",
    "r Cut Off List for Maharashtra & Minority Seats",
    "Degree Courses In Engineering and Technology",
    "Legends:",
    "Maharashtra State Seats - Cut Off Indicates",
)

LOCATION_OVERRIDES = {
    "01276": "Akola",
    "02508": "Nanded",
    "02516": "Chhatrapati Sambhajinagar",
    "02641": "Osmanabad",
    "02666": "Chhatrapati Sambhajinagar",
    "03025": "Mumbai",
    "03202": "Deorukh",
    "03209": "Mumbai",
    "03220": "Karjat",
    "03277": "Bhayandar",
    "03445": "Shahapur",
    "03470": "Sawantwadi",
    "03546": "Titwala",
    "04163": "Chandrapur",
    "05173": "Nashik",
    "05303": "Shrigonda",
    "06185": "Lonavala",
    "06217": "Vathar",
    "06271": "Pune",
    "06315": "Panhala",
    "06326": "Pandharpur",
    "06622": "Pune",
    "06632": "Naigaon",
    "06635": "Belhe",
    "06766": "Phaltan",
    "06811": "Atigre",
    "06938": "Solapur",
    "16006": "Pune",
}

SECTION_HEADINGS = (
    "State Level",
    "Home University Seats Allotted to Home University Candidates",
    "Home University Seats Allotted to Other Than Home University Candidates",
    "Other Than Home University Seats Allotted to Other Than Home University Candidates",
    "Other Than Home University Seats Allotted to Home University Candidates",
    "All India Seats",
    "Minority Seats",
    "Institutional Seats",
    "Institute Level",
)

INSTITUTE_RE = re.compile(r"^(?P<code>\d{5})\s+-\s+(?P<name>.+)$")
PROGRAM_RE = re.compile(r"^(?P<code>\d{10}[A-Z]?)\s+-\s+(?P<name>.+)$")
YEAR_RE = re.compile(r"for the Year\s+(?P<year>\d{4}-\d{2})", re.IGNORECASE)
ROUND_RE = re.compile(r"CAP Round\s*-?\s*(?P<round>[IVX]+)", re.IGNORECASE)


@dataclass
class SectionContext:
    seat_group: str


@dataclass
class SectionRun:
    institute_code: str
    institute_name: str
    program_code: str
    program_name: str
    status: str
    home_university: str
    seat_group: str
    default_stage: str


@dataclass
class ProgramContext:
    institute_code: str
    institute_name: str
    program_code: str
    program_name: str
    status: str = ""
    home_university: str = ""
    sections: list[SectionContext] = field(default_factory=list)


def normalize_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\n", " ")).strip()


def derive_location(institute_code: str, institute_name: str) -> str:
    cleaned = normalize_whitespace(institute_name).strip(" .")
    override = LOCATION_OVERRIDES.get(institute_code)
    if override:
        return override
    if "," in cleaned:
        parts = [part.strip(" .()") for part in cleaned.split(",") if part.strip(" .()")]
        while parts:
            candidate = parts.pop()
            if re.fullmatch(r"\d{5,6}", candidate):
                continue
            if candidate:
                return candidate
    return cleaned


def percentile_to_college_band(score: float) -> str:
    if score >= 99:
        return "A"
    if score >= 98:
        return "B"
    if score >= 97:
        return "C"
    if score >= 96:
        return "D"
    if score >= 95:
        return "E"
    if score >= 94:
        return "F"
    if score >= 93:
        return "G"
    if score >= 92:
        return "H"
    if score >= 91:
        return "I"
    if score >= 90:
        return "J"
    if score >= 89:
        return "K"
    if score >= 88:
        return "L"
    if score >= 87:
        return "M"
    if score >= 86:
        return "N"
    if score >= 85:
        return "O"
    if score >= 84:
        return "P"
    if score >= 83:
        return "Q"
    if score >= 82:
        return "R"
    if score >= 81:
        return "S"
    if score >= 80:
        return "T"
    return "Z"


def is_noise_line(line: str) -> bool:
    if not line:
        return True
    if line.isdigit():
        return True
    return any(line.startswith(prefix) for prefix in HEADER_PREFIXES)


def split_status(status_line: str) -> tuple[str, str]:
    status_text = status_line.removeprefix("Status:").strip()
    if " Home University :" in status_text:
        status, home_university = status_text.split(" Home University :", 1)
        return normalize_whitespace(status), normalize_whitespace(home_university)
    return normalize_whitespace(status_text), ""


def clean_header(cell: str | None) -> str:
    return normalize_whitespace(cell or "")


def parse_cell(cell: str | None) -> tuple[int | None, float | None]:
    value = normalize_whitespace(cell or "")
    if not value:
        return None, None

    rank_match = re.search(r"\d+", value)
    percentile_match = re.search(r"\(([\d.]+)\)", value)

    rank = int(rank_match.group(0)) if rank_match else None
    percentile = float(percentile_match.group(1)) if percentile_match else None
    return rank, percentile


def extract_metadata(pdf: pdfplumber.PDF) -> tuple[str | None, str | None]:
    for page in pdf.pages[:3]:
        text = page.extract_text() or ""
        year_match = YEAR_RE.search(text)
        round_match = ROUND_RE.search(text)
        year = year_match.group("year") if year_match else None
        cap_round = f"CAP Round {round_match.group('round')}" if round_match else None
        if year or cap_round:
            return year, cap_round
    return None, None


def build_program_sequence(page_text: str) -> list[ProgramContext]:
    lines = [line.strip() for line in page_text.splitlines()]
    programs: list[ProgramContext] = []

    institute_code = ""
    institute_name = ""
    current_program: ProgramContext | None = None

    i = 0
    while i < len(lines):
        line = lines[i]
        if is_noise_line(line):
            i += 1
            continue

        institute_match = INSTITUTE_RE.match(line)
        if institute_match:
            institute_code = institute_match.group("code")
            institute_name = normalize_whitespace(institute_match.group("name"))
            i += 1
            continue

        program_match = PROGRAM_RE.match(line)
        if program_match:
            program_name_parts = [program_match.group("name").strip()]
            j = i + 1
            while j < len(lines):
                next_line = lines[j].strip()
                if not next_line or next_line.startswith("Status:"):
                    break
                if any(
                    (
                        INSTITUTE_RE.match(next_line),
                        PROGRAM_RE.match(next_line),
                        next_line in SECTION_HEADINGS,
                        next_line.startswith("Stage "),
                    )
                ):
                    break
                if is_noise_line(next_line):
                    break
                program_name_parts.append(next_line)
                j += 1

            current_program = ProgramContext(
                institute_code=institute_code,
                institute_name=institute_name,
                program_code=program_match.group("code"),
                program_name=normalize_whitespace(" ".join(program_name_parts)),
            )
            programs.append(current_program)
            i = j
            continue

        if current_program and line.startswith("Status:"):
            status, home_university = split_status(line)
            current_program.status = status
            current_program.home_university = home_university
            i += 1
            continue

        if current_program and line in SECTION_HEADINGS:
            current_program.sections.append(SectionContext(seat_group=line))
            i += 1
            continue

        i += 1

    return programs


def iter_page_records(
    page: pdfplumber.page.Page,
    continuation_runs: list[SectionRun] | None = None,
) -> tuple[list[dict], list[str], list[SectionRun]]:
    text = page.extract_text() or ""
    programs = build_program_sequence(text)
    tables = page.extract_tables()

    if not programs and tables and continuation_runs:
        return parse_continuation_page(page, tables, continuation_runs)

    expected_sections = sum(len(program.sections) for program in programs)
    warnings: list[str] = []
    if expected_sections != len(tables):
        warnings.append(
            f"Page {page.page_number}: found {len(tables)} tables but {expected_sections} section headings."
        )

    records: list[dict] = []
    page_runs: list[SectionRun] = []
    table_index = 0
    for program in programs:
        for section in program.sections:
            if table_index >= len(tables):
                warnings.append(
                    f"Page {page.page_number}: missing table for {program.program_code} / {section.seat_group}."
                )
                break

            table = tables[table_index]
            table_index += 1
            default_stage = next(
                (clean_header(row[0]) for row in table[1:] if row and clean_header(row[0])),
                "I",
            )
            page_runs.append(
                SectionRun(
                    institute_code=program.institute_code,
                    institute_name=program.institute_name,
                    program_code=program.program_code,
                    program_name=program.program_name,
                    status=program.status,
                    home_university=program.home_university,
                    seat_group=section.seat_group,
                    default_stage=default_stage,
                )
            )
            headers = [clean_header(cell) for cell in table[0][1:]]

            for row in table[1:]:
                stage = clean_header(row[0])
                if not stage:
                    continue

                for category, cell in zip(headers, row[1:]):
                    rank, percentile = parse_cell(cell)
                    if rank is None and percentile is None:
                        continue

                    records.append(
                        {
                            "institute_code": program.institute_code,
                            "institute_name": program.institute_name,
                            "location": derive_location(
                                program.institute_code, program.institute_name
                            ),
                            "program_code": program.program_code,
                            "program_name": program.program_name,
                            "status": program.status,
                            "home_university": program.home_university,
                            "seat_group": section.seat_group,
                            "stage": stage,
                            "category": category,
                            "cutoff_rank": rank,
                            "cutoff_percentile": percentile,
                            "page_number": page.page_number,
                        }
                    )

    if table_index < len(tables):
        warnings.append(
            f"Page {page.page_number}: {len(tables) - table_index} table(s) were not mapped to program sections."
        )

    return records, warnings, page_runs


def parse_continuation_page(
    page: pdfplumber.page.Page,
    tables: list[list[list[str | None]]],
    continuation_runs: list[SectionRun],
) -> tuple[list[dict], list[str], list[SectionRun]]:
    warnings: list[str] = []
    records: list[dict] = []

    if len(tables) > len(continuation_runs):
        warnings.append(
            f"Page {page.page_number}: continuation page has {len(tables)} tables but only {len(continuation_runs)} prior section runs."
        )

    target_runs = continuation_runs[-len(tables) :]
    for section_run, table in zip(target_runs, tables):
        headers = [clean_header(cell) for cell in table[0]]
        data_rows = table[1:]
        if not data_rows:
            continue

        for row in data_rows:
            values = row
            stage = section_run.default_stage
            if len(row) == len(headers) + 1:
                stage = clean_header(row[0]) or stage
                values = row[1:]

            for category, cell in zip(headers, values):
                rank, percentile = parse_cell(cell)
                if rank is None and percentile is None:
                    continue

                records.append(
                    {
                        "institute_code": section_run.institute_code,
                        "institute_name": section_run.institute_name,
                        "location": derive_location(
                            section_run.institute_code, section_run.institute_name
                        ),
                        "program_code": section_run.program_code,
                        "program_name": section_run.program_name,
                        "status": section_run.status,
                        "home_university": section_run.home_university,
                        "seat_group": section_run.seat_group,
                        "stage": stage,
                        "category": category,
                        "cutoff_rank": rank,
                        "cutoff_percentile": percentile,
                        "page_number": page.page_number,
                    }
                )

    return records, warnings, target_runs


def convert_pdf(pdf_path: Path) -> tuple[list[dict], dict]:
    records: list[dict] = []
    warnings: list[str] = []
    continuation_runs: list[SectionRun] = []

    with pdfplumber.open(pdf_path) as pdf:
        year, cap_round = extract_metadata(pdf)
        for page in pdf.pages:
            page_records, page_warnings, page_runs = iter_page_records(
                page, continuation_runs=continuation_runs
            )
            records.extend(page_records)
            warnings.extend(page_warnings)
            if page_runs:
                continuation_runs = page_runs

    rank_map = build_college_rank_map(records)
    for row in records:
        rank_info = rank_map[(row["institute_code"], row["institute_name"])]
        row["college_rank_maharashtra"] = rank_info["rank"]
        row["college_rank_score"] = rank_info["score"]
        row["college_band"] = rank_info["band"]

    unique_programs = {(row["program_code"], row["seat_group"]) for row in records}
    metadata = {
        "source_pdf": str(pdf_path),
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "academic_year": year,
        "cap_round": cap_round,
        "record_count": len(records),
        "program_section_count": len(unique_programs),
        "location_count": len({row["location"] for row in records}),
        "ranking_method": "Derived from cutoff data using the best available OPEN-category cutoff percentile per institute; higher score means stronger demand/selectivity in this dataset.",
        "college_band_method": "A for 99+ best institute cutoff percentile, B for 98-99, continuing one percentile per band down to T for 80-81, and Z for below 80.",
        "warning_count": len(warnings),
        "warnings": warnings,
    }
    return records, metadata


def build_college_rank_map(records: list[dict]) -> dict[tuple[str, str], dict]:
    institute_scores: dict[tuple[str, str], list[float]] = {}

    for row in records:
        key = (row["institute_code"], row["institute_name"])
        institute_scores.setdefault(key, [])
        category = row["category"].replace(" ", "")
        percentile = row["cutoff_percentile"]
        if percentile is None:
            continue

        if "OPEN" in category:
            institute_scores[key].append(float(percentile) + 1000.0)
        else:
            institute_scores[key].append(float(percentile))

    ranked = sorted(
        (
            {
                "key": key,
                "score": round(max(scores), 6) if scores else 0.0,
                "band_percentile": round(
                    max((score - 1000.0) if score >= 1000.0 else score for score in scores), 6
                )
                if scores
                else 0.0,
            }
            for key, scores in institute_scores.items()
        ),
        key=lambda item: (-item["score"], item["key"][1]),
    )

    rank_map: dict[tuple[str, str], dict] = {}
    current_rank = 0
    last_score: float | None = None
    for index, item in enumerate(ranked, start=1):
        if last_score != item["score"]:
            current_rank = index
            last_score = item["score"]
        rank_map[item["key"]] = {
            "rank": current_rank,
            "score": item["score"],
            "band_percentile": item["band_percentile"],
            "band": percentile_to_college_band(item["band_percentile"]),
        }

    return rank_map


def write_output(output_path: Path, payload: dict) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def parse_args(args: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert an MHT CET cutoff PDF into flat JSON records."
    )
    parser.add_argument("pdf", type=Path, help="Path to the cutoff PDF.")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path("data") / "cutoffs_2024_cap1.json",
        help="Path to write the generated JSON file.",
    )
    return parser.parse_args(args)


def main() -> None:
    args = parse_args()
    records, metadata = convert_pdf(args.pdf)
    payload = {"metadata": metadata, "records": records}
    write_output(args.output, payload)

    print(f"Wrote {metadata['record_count']} records to {args.output}")
    if metadata["warning_count"]:
        print(f"Completed with {metadata['warning_count']} warnings.")


if __name__ == "__main__":
    main()
