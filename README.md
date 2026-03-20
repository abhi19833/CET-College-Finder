# MHT CET College Predictor

This workspace contains:

- a PDF-to-JSON converter for MHT CET cutoff data
- a Vite + React + Tailwind frontend
- an Express backend API that filters the generated cutoff JSON for college prediction

## Files

- `scripts/convert_cutoff_pdf.py` converts the official cutoff PDF into JSON.
- `data/cutoffs_2024_cap1.json` is the generated output from `2024ENGG_CAP1_CutOff.pdf`.
- `frontend` is the Vite frontend.
- `backend` is the Express API.

## Install

```powershell
npm install
```

## Run

Start the backend:

```powershell
npm run dev:backend
```

Start the frontend:

```powershell
npm run dev:frontend
```

The frontend runs on `http://localhost:5173` and proxies API requests to `http://localhost:5000`.

## Rebuild cutoff JSON

```powershell
python scripts/convert_cutoff_pdf.py "C:\Users\abhis\Downloads\2024ENGG_CAP1_CutOff.pdf"
```

## JSON shape

Each row in `records` is a single cutoff entry:

```json
{
  "institute_code": "01002",
  "institute_name": "Government College of Engineering, Amravati",
  "program_code": "0100224210",
  "program_name": "Computer Science and Engineering",
  "status": "Government Autonomous",
  "home_university": "Autonomous Institute",
  "seat_group": "State Level",
  "stage": "I",
  "category": "GOPENS",
  "cutoff_rank": 7872,
  "cutoff_percentile": 97.3911937,
  "page_number": 1
}
```

## Prediction logic

The backend filters records by:

- `category`
- `seat_group`
- `home_university`
- `program_name`
- `institute_name`
- `cutoff_percentile <= student_percentile`

Then it sorts matches by cutoff percentile descending and labels them:

- `Safe`: percentile gap is at least `3`
- `Target`: percentile gap is at least `1`
- `Dream`: percentile gap is below `1`
