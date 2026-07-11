"""GPT-5 Vision client.

Two entry points used by the UI:
- `produce_report()` — sends representative slices and returns a
  structured radiology report addressed to a physician colleague.
- `chat_about_study()` — Q&A over the same study, with a fresh image
  attached each turn so the model can answer spatial questions.

Uses OPENAI_API_KEY secret exclusively. Does NOT use Replit AI Integrations.
"""
from __future__ import annotations

import base64
import io
import os

import numpy as np
from openai import OpenAI
from PIL import Image
from tenacity import retry, stop_after_attempt, wait_exponential

AI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-5")


def _build_client() -> tuple[OpenAI, str]:
    timeout_sec = float(os.environ.get("OPENAI_REQUEST_TIMEOUT", "180"))

    # الأولوية: OPENAI_API_KEY الشخصي، ثم مفاتيح Replit AI Integrations
    direct = os.environ.get("OPENAI_API_KEY")
    if direct:
        return OpenAI(api_key=direct, timeout=timeout_sec), "OPENAI_API_KEY (personal)"

    integ_key = os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY")
    integ_url = os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL")
    if integ_key and integ_url:
        return (
            OpenAI(api_key=integ_key, base_url=integ_url, timeout=timeout_sec),
            "AI_INTEGRATIONS_OPENAI_API_KEY (Replit)",
        )

    raise RuntimeError(
        "لا يوجد مفتاح OpenAI. أضف OPENAI_API_KEY في Secrets 🔒. / "
        "No OpenAI key found. Add OPENAI_API_KEY in Secrets."
    )


def credentials_status() -> str:
    """Human-readable description of which credential source is active."""
    try:
        _, source = _build_client()
        return f"✅ {source}"
    except RuntimeError as e:
        return f"❌ {e}"


SYSTEM_PROMPT = """You are a senior consultant radiologist writing a SIGNED report
for a referring physician. Your goal is the EXACT FORMAT, BREVITY,
and DECISIVENESS of a real consultant report — not a CME explanation
and not a hedged AI checklist.

═══════════════════════════════════════════════════════════════════
FORMAT RULES (NON-NEGOTIABLE)
═══════════════════════════════════════════════════════════════════

1. ENGLISH-FIRST, TELEGRAPHIC STYLE.
   - Output the entire report in English. Add Arabic only inside the
     Impression block IF the physician's notes were in Arabic.
   - Short sentences. No paragraphs of explanation. One observation
     per bullet.

2. STRUCTURE (exact section headers, in this order):
        Procedure:
        Technique:
        Clinical context:
        Morphology / Findings:
            • Region 1:
            • Region 2:
            • ...
        Impression:
            (boxed, 3–5 numbered lines)

3. QUANTITATIVE MANDATE — every visible finding carries a measurement.
   - Mass / lesion / cyst → three dimensions in mm or cm.
   - Organ size → volume in cc or gm where applicable
     (prostate, liver, spleen, kidneys, thyroid).
   - Joint effusion / fluid collection → approximate depth in mm.
   - Lymph node → short × long axis in mm.
   - Cartilage thickness, meniscal extrusion → mm.
   - If a measurement is impossible from the supplied images, write
     "not measurable on this set" — do NOT omit silently.

4. SIGNAL / DENSITY LANGUAGE BY MODALITY:
   - CT → "hypodense / hyperdense / isodense (HU ≈ X)".
   - MR → "T1 hypointense", "T2 hyperintense", "restricted diffusion
     ADC ≈ X × 10⁻³ mm²/sec", "fat-suppressed sequences show ...".
   - When giving ADC or ratios, ALWAYS attach a reference range in
     parentheses: "ADC = 0.55 × 10⁻³ mm²/sec (benign > 1×10⁻³)".

5. STANDARD SCORING SYSTEMS — use them BY NAME whenever applicable:
        Prostate MR     → PI-RADS v2.1 (cite category 1–5)
        Liver (HCC)     → LI-RADS v2018 (LR-1 … LR-5, LR-M, LR-TIV)
        Lung nodule     → Lung-RADS v1.1 (categories 1–4X)
        Breast          → BI-RADS (0–6)
        Brain stroke    → ASPECTS (0–10) for MCA territory
        Knee OA         → Kellgren-Lawrence grade I–IV
        Knee MR         → MOAKS for cartilage / meniscus / marrow
        Spine disc      → Pfirrmann grade I–V; Modic 1/2/3 endplate
        Adrenal nodule  → Hounsfield washout phenotype
        Thyroid nodule  → TI-RADS / ACR-TIRADS
        BIRADS for breast US too
   If no standard exists, give a written grade (mild / moderate /
   severe) consistently.

6. ANATOMY IS ZONE-SPECIFIC, NEVER VAGUE.
   - "Right peripheral zone", not "right side".
   - "Posterior horn of medial meniscus", not "back of meniscus".
   - "Suprapatellar recess", not "front of knee".
   - "Common peroneal nerve at the fibular neck", not "nerve near
     fibula".

7. BEHAVIOR VERBS (active, decisive):
   "Infiltrating", "Distorting", "Bulging through", "Compressing",
   "Displacing", "Eroding", "Extending into", "Encasing".
   Avoid: "may represent", "could be", "appears to possibly suggest".

═══════════════════════════════════════════════════════════════════
IMPRESSION RULES (BOXED, 3–5 LINES MAX, ZERO HEDGING)
═══════════════════════════════════════════════════════════════════

Line 1: PRIMARY diagnosis in decisive language, with score/grade in
        brackets if applicable. e.g.
            • "Malignant focal lesion at right peripheral zone
               [PI-RADS 5] — for trans-rectal biopsy."
            • "Grade III medial compartment osteoarthritis
               (Kellgren-Lawrence) — for orthopedic consult."

Line 2–3: Secondary findings, each with an explicit ACTION:
              "for histopathology", "for PSMA-PET correlation",
              "for follow-up MRI at 6 months", "for orthopedic
              referral", "no further action".

Line 4 (optional): Notable incidentals.

The Impression must contain ZERO of these words:
   "probable", "favored", "consider", "could represent", "may be",
   "possibly", "suggests", "compatible with the possibility of".

The body of the report (Morphology / Findings) may carry a brief
differential when honestly warranted, but the Impression is the
attending's commitment — write it as you would defend it at a
multidisciplinary tumor board.

═══════════════════════════════════════════════════════════════════
HEDGING BUDGET FOR THE ENTIRE REPORT
═══════════════════════════════════════════════════════════════════

≤ 3 hedging words ("probable" / "favored" / "consider" / "may" /
"could" / "possibly") across the whole document. Audit yourself
before you submit. Real consultants commit.

═══════════════════════════════════════════════════════════════════
ANATOMY DISCIPLINE — DO NOT INVENT OUT-OF-REGION FINDINGS
═══════════════════════════════════════════════════════════════════

When the user message provides "ALLOWED ANATOMY" / "REGION UNDER
EXAMINATION", you MUST confine the entire report to that list:

- NEVER fabricate findings in regions outside the examination
  (e.g., do not mention "knee", "leg", "head", or "craniofacial"
  on a prostate or pelvic MRI).
- Series-name suffixes like "tra", "sag", "cor", "ax", "MPR", "ND",
  "p2", "320", "bh", "fs" are PLANE / RECONSTRUCTION / SEQUENCE
  parameters — NEVER body parts.
- If a slice incidentally captures a structure outside the allowed
  list, omit it. Do NOT speculate that this represents a different
  body region.
- If the supplied images appear to be entirely outside the allowed
  region, state that under Technique as a coverage caveat — do not
  invent findings to fill the report.

═══════════════════════════════════════════════════════════════════
MODALITY DISCIPLINE
═══════════════════════════════════════════════════════════════════

The Modality value in the technical context comes from DICOM
headers. TRUST IT. CT → HU/density; MR → signal intensity by
sequence. Do not flip modality on visual hunch — the same images
get diagnosed two opposite ways (gas locules vs. coil artifacts) and
that is a patient-safety failure. If image appearance is
unambiguously the other modality, note the disagreement as a
Technique caveat and proceed with the DICOM-stated value.

═══════════════════════════════════════════════════════════════════
LATERALITY AND TIME-CRITICAL FINDINGS
═══════════════════════════════════════════════════════════════════

- When Laterality is populated, state side in the Procedure line
  (e.g., "MRI right knee"). Never write "side not specified" if a
  side is given.
- Flag prominently in Impression: subcutaneous / intramuscular
  emphysema (raise necrotizing fasciitis differential when no
  procedure history), free intraperitoneal / mediastinal air, active
  extravasation, large vessel cutoff, mass effect / midline shift,
  cord compression, lipohemarthrosis, bowel wall gas.

═══════════════════════════════════════════════════════════════════
CHECKLIST COMPLIANCE
═══════════════════════════════════════════════════════════════════

When the user message contains an Anatomical checklist, address
every item BY NAME in Findings. Visible items get a measured line.
Non-visible items get "not assessed on this set". Silent omission is
a reporting failure.

═══════════════════════════════════════════════════════════════════
TONE — what NOT to do
═══════════════════════════════════════════════════════════════════

- No patient-facing language ("consult your doctor").
- No academic explanation ("This pattern reflects ..." paragraphs).
- No drug names, dosages, or treatment plans. Recommend imaging,
  follow-up intervals, multidisciplinary referral, biopsy / histo /
  PET / aspiration where indicated.
- If the physician asked a custom research task in the user message,
  execute it in a final "Additional Task / مهمة إضافية" section
  with concrete numbers and tables — NOT prose.

You are now ready to read the case. Be brief, decisive, measured.
"""


def _windowed_b64_png(slice_array: np.ndarray, modality: str) -> str:
    """Encode a slice as PNG using a percentile-clipped auto-window.

    A fixed window (e.g. 40/400 soft tissue) saturates on slices that
    contain mostly air, bone, or brain — the model then can't see any
    anatomy and reports the study as 'technically inadequate'. Using
    the 1st-99th percentile of THIS slice's intensities keeps the full
    dynamic range visible regardless of anatomy and modality.
    """
    arr = slice_array.astype(np.float32)
    finite = arr[np.isfinite(arr)]
    if finite.size == 0:
        pixels = np.zeros(arr.shape, dtype=np.uint8)
    else:
        lower, upper = np.percentile(finite, [1.0, 99.0])
        if upper <= lower:
            lower, upper = float(arr.min()), float(arr.max())
        if upper > lower:
            normalized = np.clip((arr - lower) / (upper - lower), 0, 1)
        else:
            normalized = np.zeros_like(arr)
        pixels = (normalized * 255).astype(np.uint8)
    img = Image.fromarray(pixels, mode="L").convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _representative_indices(num_slices: int, count: int) -> list[int]:
    """Evenly-spaced indices covering the whole study.

    For count=12 over 134 slices: ~every 11 slices, anatomically
    spread from inferior to superior so the model gets full coverage.
    """
    if num_slices <= 0:
        return []
    if num_slices <= count:
        return list(range(num_slices))
    # Linear sampling skipping the very first and last (often scout
    # slices or artifact-heavy boundary).
    step = num_slices / (count + 1)
    return [int(round(step * (k + 1))) for k in range(count)]


class EmptyCompletion(RuntimeError):
    """The model returned an empty response (usually because the
    completion budget was exhausted by reasoning tokens before any
    visible output was produced)."""


# GPT-5 pricing (USD per 1M tokens) — input vs output. Reasoning
# tokens are billed at the output rate. Override at deploy time via
# OPENAI_PRICE_INPUT / OPENAI_PRICE_OUTPUT env vars if OpenAI changes
# its sheet.
INPUT_PRICE_PER_M = float(os.environ.get("OPENAI_PRICE_INPUT", "1.25"))
OUTPUT_PRICE_PER_M = float(os.environ.get("OPENAI_PRICE_OUTPUT", "10.0"))


def compute_cost_usd(usage: dict) -> dict:
    """Return cost breakdown for one API call.

    Output billing covers BOTH visible output tokens and the model's
    internal reasoning tokens (true for GPT-5 reasoning models).
    """
    prompt = int(usage.get("prompt", 0) or 0)
    completion = int(usage.get("completion") or 0)
    # `completion` already includes reasoning per OpenAI's accounting,
    # but fall back to visible + reasoning if `completion` is missing.
    if not completion:
        completion = int(usage.get("visible", 0) or 0) + int(usage.get("reasoning", 0) or 0)
    input_cost = prompt / 1_000_000 * INPUT_PRICE_PER_M
    output_cost = completion / 1_000_000 * OUTPUT_PRICE_PER_M
    return {
        "input_usd": round(input_cost, 6),
        "output_usd": round(output_cost, 6),
        "total_usd": round(input_cost + output_cost, 6),
    }


def _extract_usage(resp) -> dict:
    """Pull a flat usage record out of an OpenAI API response.

    GPT-5 (and other reasoning models) split the completion budget
    between *visible* output and *internal* reasoning tokens. We surface
    both so the doctor can see why an analysis sometimes returns short
    or empty — most of the budget went to thinking.
    """
    usage = getattr(resp, "usage", None)
    if usage is None:
        return {"prompt": 0, "completion": 0, "reasoning": 0, "visible": 0, "total": 0}
    prompt = int(getattr(usage, "prompt_tokens", 0) or 0)
    completion = int(getattr(usage, "completion_tokens", 0) or 0)
    total = int(getattr(usage, "total_tokens", prompt + completion) or 0)
    reasoning = 0
    details = getattr(usage, "completion_tokens_details", None)
    if details is not None:
        reasoning = int(getattr(details, "reasoning_tokens", 0) or 0)
    return {
        "prompt": prompt,
        "completion": completion,
        "reasoning": reasoning,
        # Visible output = total completion minus internal reasoning
        "visible": max(completion - reasoning, 0),
        "total": total,
    }


@retry(
    reraise=True,
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
)
def _chat_completion(messages: list[dict], max_tokens: int = 6000) -> tuple[str, dict]:
    client, _ = _build_client()
    resp = client.chat.completions.create(
        model=AI_MODEL,
        messages=messages,
        max_completion_tokens=max_tokens,
    )
    choice = resp.choices[0]
    content = choice.message.content or ""
    usage = _extract_usage(resp)
    if not content.strip():
        finish = getattr(choice, "finish_reason", "unknown") or "unknown"
        # GPT-5 and other reasoning models count internal reasoning
        # tokens against max_completion_tokens. When the budget is too
        # tight relative to image count, the model burns it all on
        # reasoning and emits no visible text.
        raise EmptyCompletion(
            f"Model returned empty content (finish_reason={finish}, "
            f"prompt={usage['prompt']} tokens, reasoning={usage['reasoning']} tokens, "
            f"visible={usage['visible']} tokens). "
            f"Increase max_completion_tokens or send fewer images."
        )
    return content, usage


MAX_SAMPLE_SLICES = 40  # GPT-5 vision practical ceiling per request


def is_localizer(description: str, protocol_name: str = "") -> bool:
    """Detect localizer / scout / survey series.

    These are positioning runs (often 3 slices, low resolution); they
    contribute nothing diagnostic and would skew a Full-Study read if
    treated as a real sequence.
    """
    blob = f"{description or ''} {protocol_name or ''}".upper()
    return any(w in blob for w in ("LOC", "LOCALIZER", "SCOUT", "SURVEY", "TOPO", "PLANSCAN"))


_SYNTHESIS_INSTRUCTION = (
    "You are synthesizing several per-sequence radiology reads of the "
    "SAME study into one unified structured report. Each input below "
    "is the read of a single MRI series (e.g. Sag T2, Cor T1, Ax PD-FS); "
    "each saw different tissue properties. Your job is to combine "
    "them, deduplicate overlapping findings, and resolve disagreements "
    "by trusting the most-appropriate sequence for that anatomy.\n\n"
    "Rules:\n"
    "- Output the standard structured radiology report (Technique / "
    "Comparison / Findings / Impression) ONCE — not per series.\n"
    "- In the Technique section, list every sequence that was read.\n"
    "- In Findings, attribute each observation to the sequence that "
    "best demonstrates it (e.g. 'Joint effusion: hyperintense fluid "
    "in suprapatellar recess, best on Sag T2 slices 5-12; corresponds "
    "to low-signal fluid on Cor T1').\n"
    "- In Impression, list each finding ONCE even if multiple sequences "
    "showed it. Do not re-list the same effusion under five different "
    "sequence headings.\n"
    "- Sequence-specific reasoning: fluid bright on T2/PD-FS is real "
    "fluid; punctate signal voids that appear across ALL sequences are "
    "true gas / metal artifacts, but those visible only on one fat-sat "
    "sequence are usually susceptibility artifacts from coil hardware "
    "or skin markers."
)



def _anatomy_whitelist(body_part: str, description: str) -> tuple[str, list[str]]:
    """Return (canonical_region, allowed_anatomy_tokens) for the study.

    The model was inventing anatomy out of the series-name plane
    abbreviations — interpreting 'tra' (transverse) as 'trans-leg' on
    a prostate MRI and producing 'knee' and 'distal leg' findings.
    Injecting an explicit whitelist of the regions allowed for this
    study type forces it to stay in-bounds. Anything not in the list
    must be omitted, not fabricated.
    """
    blob = f"{body_part or ''} {description or ''}".lower()

    def has(*words: str) -> bool:
        return any(w in blob for w in words)

    if has("prostate", "prostatic", "pirads", "pi-rads"):
        return (
            "Male pelvis / prostate",
            [
                "prostate (peripheral / transition / central / anterior fibromuscular zones)",
                "seminal vesicles", "ejaculatory ducts",
                "urinary bladder (wall, lumen, trigone)",
                "rectum / rectal wall",
                "pelvic side walls", "obturator muscles", "levator ani",
                "pelvic lymph nodes (obturator / external iliac / internal iliac)",
                "inguinal lymph nodes",
                "iliac vessels", "femoral vessels",
                "pelvic bones (sacrum, ilium, pubis, ischium, femoral heads)",
                "bone marrow signal",
                "subcutaneous tissues of the pelvis",
            ],
        )
    if has("knee"):
        return (
            "Knee joint",
            [
                "femur (distal articular surface, condyles, trochlea)",
                "tibia (proximal articular surface, plateaux)",
                "patella", "patellar tendon", "quadriceps tendon",
                "fibular head", "common peroneal nerve at fibular neck",
                "medial / lateral menisci (anterior horn, body, posterior horn)",
                "ACL, PCL, MCL, LCL, popliteus, ITB",
                "articular cartilage (medial / lateral / patellofemoral)",
                "subchondral bone marrow",
                "joint effusion / synovium",
                "suprapatellar recess", "Hoffa fat pad", "popliteal fossa (Baker cyst)",
                "neurovascular bundle in popliteal fossa",
            ],
        )
    if has("liver", "hepatic"):
        return (
            "Liver and upper abdomen",
            [
                "liver (segments I–VIII, surface contour)",
                "intrahepatic & extrahepatic bile ducts", "gallbladder",
                "portal vein, hepatic veins, IVC, hepatic artery",
                "pancreas", "spleen",
                "adrenal glands", "kidneys (upper poles if covered)",
                "peri-portal / porta hepatis lymph nodes",
                "ascites / peritoneum",
                "lower thorax bases if covered",
            ],
        )
    if has("lung", "chest", "thorax", "pulmonary"):
        return (
            "Chest / thorax",
            [
                "lung parenchyma (lobes, segments)", "airways (trachea, mainstem, lobar bronchi)",
                "pleura", "pleural spaces",
                "mediastinum (compartments, lymph node stations)",
                "heart and great vessels", "pericardium",
                "esophagus",
                "thoracic spine and posterior elements",
                "soft tissues of chest wall",
                "axillae", "thoracic inlet structures",
            ],
        )
    if has("breast", "mammo"):
        return (
            "Breast and axilla",
            [
                "breast parenchyma (quadrants, depth)",
                "skin and nipple-areolar complex",
                "pectoralis muscles", "chest wall interface",
                "axillary lymph nodes (levels I/II/III)",
                "internal mammary nodes",
            ],
        )
    if has("brain", "head", "cranium", "stroke", "infarct"):
        return (
            "Brain / head",
            [
                "cerebral hemispheres (frontal, parietal, temporal, occipital lobes)",
                "deep grey nuclei (basal ganglia, thalami)",
                "brainstem (midbrain, pons, medulla)", "cerebellum",
                "ventricular system", "extra-axial CSF spaces",
                "midline structures (corpus callosum, septum pellucidum)",
                "vascular territories (ACA / MCA / PCA / basilar)",
                "skull base / calvarium",
                "paranasal sinuses and mastoids if covered",
                "orbits if covered",
            ],
        )
    if has("spine", "cervical", "lumbar", "thoracic", "sacrum"):
        return (
            "Spine",
            [
                "vertebral body alignment and height",
                "intervertebral discs (T2 signal, herniation, bulge)",
                "endplates (Modic changes)",
                "spinal cord / cauda equina / conus medullaris",
                "central canal / lateral recess / neural foramina",
                "facet joints", "ligamenta flava", "interspinous space",
                "paraspinal muscles",
            ],
        )
    if has("abdomen", "pelvis", "pelvic"):
        return (
            "Abdomen / pelvis",
            [
                "liver, biliary tree, gallbladder",
                "pancreas, spleen, adrenals",
                "kidneys, ureters, urinary bladder",
                "stomach and bowel loops",
                "mesentery, peritoneum, retroperitoneum",
                "pelvic organs (prostate or uterus / ovaries)",
                "abdominal aorta, IVC, iliac vessels",
                "retroperitoneal and pelvic lymph nodes",
                "abdominal wall and bony pelvis",
            ],
        )

    return ("", [])


# Words the consultant treats as fence-sitting. The post-processor
# counts these against a hard budget and re-prompts if exceeded.
_HEDGE_PATTERNS = (
    "probable", "probably", "favored", "consider", "could represent",
    "could be", "may be", "may represent", "possibly", "suggests",
    "compatible with the possibility", "cannot be excluded",
    "not measurable on this set", "not assessed on this set",
    "non-diagnostic", "limited",
)


def _count_hedging(text: str) -> tuple[int, list[str]]:
    """Return (total_count, sorted unique matches) of hedging tokens."""
    if not text:
        return 0, []
    lower = text.lower()
    hits: dict[str, int] = {}
    for pat in _HEDGE_PATTERNS:
        n = lower.count(pat)
        if n:
            hits[pat] = n
    total = sum(hits.values())
    return total, sorted(hits.keys(), key=lambda k: -hits[k])


def _scoring_system_hint(body_part: str, description: str, modality: str = "") -> str:
    """Return the standard reporting / scoring system the consultant
    would use for this region, BY NAME.

    Injected into the user message so the model uses 'PI-RADS 4' /
    'Kellgren-Lawrence III' / 'LR-3' rather than 'moderate-grade'.
    """
    blob = f"{body_part or ''} {description or ''}".lower()
    mod = (modality or "").upper()

    def has(*words: str) -> bool:
        return any(w in blob for w in words)

    hints: list[str] = []

    if has("prostate", "prostatic"):
        hints.append(
            "PROSTATE MR → categorize the dominant lesion with PI-RADS v2.1 "
            "(1-5) using T2WI, DWI/ADC, and DCE rules. Cite the ADC value "
            "with a benign reference range. Mention extracapsular extension "
            "and seminal vesicle invasion if seen."
        )
    if has("liver", "hepatic", "hcc"):
        hints.append(
            "LIVER MR/CT → if a focal lesion is present in a cirrhotic or "
            "at-risk patient, categorize with LI-RADS v2018 (LR-1 to LR-5, "
            "LR-M, LR-TIV)."
        )
    if has("lung nodule", "pulmonary nodule") or (has("lung", "chest") and "nodule" in blob):
        hints.append(
            "LUNG NODULE → categorize with Lung-RADS v1.1 (1, 2, 3, 4A, "
            "4B, 4X). Give nodule size in mm (longest axis) and indicate "
            "solid / part-solid / non-solid."
        )
    if has("breast", "mammo"):
        hints.append(
            "BREAST → categorize with BI-RADS (0-6) for the dominant lesion. "
            "Note shape, margins, internal echo (US) or enhancement kinetics "
            "(MR)."
        )
    if has("stroke", "infarct", "mca"):
        hints.append(
            "ACUTE STROKE → score the MCA territory with ASPECTS (0-10). "
            "State the affected vascular territory by name."
        )
    if has("knee"):
        hints.append(
            "KNEE → grade osteoarthritis with Kellgren-Lawrence (I-IV). "
            "For cartilage / meniscus / subchondral marrow on MRI use MOAKS "
            "or WORMS scoring as applicable. ACL/PCL state must be one of: "
            "intact, low-grade interstitial change, partial tear, complete tear "
            "— no fence-sitting."
        )
    if has("shoulder"):
        hints.append(
            "SHOULDER → for rotator-cuff tear state full-thickness vs "
            "partial-thickness and give tear width in mm. Acromion type "
            "(Bigliani I-III)."
        )
    if has("spine", "cervical", "lumbar", "thoracic"):
        hints.append(
            "SPINE → disc degeneration with Pfirrmann grade (I-V). "
            "Endplate change with Modic type (1 / 2 / 3). Stenosis with "
            "qualitative grade (mild / moderate / severe)."
        )
    if has("thyroid"):
        hints.append(
            "THYROID → categorize nodules with ACR-TIRADS (TR1-TR5)."
        )
    if has("adrenal"):
        hints.append(
            "ADRENAL → for an adenoma, cite Hounsfield washout (absolute "
            "and relative) and the unenhanced HU."
        )

    return "\n".join(hints) if hints else ""


def _anatomical_checklist(body_part: str, description: str) -> list[str]:
    """Return the structures a senior radiologist always addresses for
    this body region. Injected into the prompt so the model can't
    silently skip menisci on a knee, Baker's cyst on the popliteal
    fossa, or basal cisterns on a head study.

    The list is suggestive, not exhaustive — items not visible on the
    submitted images should be acknowledged as 'not assessed' rather
    than fabricated.
    """
    blob = f"{body_part or ''} {description or ''}".lower()

    def has(*words: str) -> bool:
        return any(w in blob for w in words)

    if has("knee"):
        return [
            "Femoral and tibial articular cartilage thickness and focal defects",
            "Subchondral bone for marrow edema, cysts, or impaction injury",
            "Medial meniscus (anterior horn, body, posterior horn) — morphology, signal, tear",
            "Lateral meniscus (anterior horn, body, posterior horn) — morphology, signal, tear",
            "Anterior cruciate ligament (course, fiber continuity, signal)",
            "Posterior cruciate ligament (course, fiber continuity, signal)",
            "Medial and lateral collateral ligaments",
            "Quadriceps and patellar tendons, patellar position / tracking",
            "Joint effusion, suprapatellar pouch distention, intra-articular bodies",
            "Popliteal fossa — Baker's cyst, vascular structures",
            "Subcutaneous tissues for edema, masses, or gas",
        ]
    if has("brain", "head", "cranial"):
        return [
            "Cerebral parenchyma — gray/white matter differentiation, focal lesions",
            "Ventricular system size and symmetry",
            "Midline shift, mass effect, herniation",
            "Basal cisterns, sulci effacement",
            "Posterior fossa — brainstem, cerebellum, fourth ventricle",
            "Extra-axial spaces — subdural, epidural, subarachnoid",
            "Acute hemorrhage, infarction, mass",
            "Skull base, calvaria, scalp soft tissues",
        ]
    if has("spine", "cervical", "thoracic", "lumbar", "sacral"):
        return [
            "Vertebral body height and signal — fractures, lesions, marrow",
            "Disc heights, hydration, herniations, annular tears",
            "Spinal canal caliber, cord signal, conus level",
            "Neural foramina — nerve root impingement",
            "Facet joints and posterior elements",
            "Paravertebral and epidural soft tissues",
            "Alignment, listhesis, scoliosis",
        ]
    if has("chest", "thorax", "lung"):
        return [
            "Lung parenchyma — nodules, consolidation, ground-glass, masses",
            "Pleural surfaces — effusion, thickening, pneumothorax",
            "Mediastinum — lymphadenopathy, masses, vascular structures",
            "Heart size and pericardium",
            "Airways and trachea/bronchi",
            "Ribs and thoracic skeleton",
            "Visualized upper abdomen",
        ]
    if has("abdomen", "pelvis", "liver", "kidney"):
        return [
            "Liver — size, contour, focal lesions, biliary tree",
            "Gallbladder, pancreas, spleen",
            "Kidneys, ureters, bladder",
            "Adrenal glands",
            "Bowel — wall thickness, obstruction, free air, ischemia",
            "Mesentery and peritoneum — fluid, masses, lymphadenopathy",
            "Vascular structures — aorta, IVC, mesenteric vessels",
            "Pelvic organs as visualized",
            "Bones and soft tissues of the abdominal wall",
        ]
    if has("shoulder"):
        return [
            "Rotator cuff (supraspinatus, infraspinatus, subscapularis, teres minor)",
            "Long head of biceps tendon and groove",
            "Glenohumeral joint — labrum, capsule, articular cartilage",
            "Acromioclavicular joint and acromion morphology",
            "Subacromial / subdeltoid bursa",
            "Glenoid and humeral head — fractures, Hill-Sachs, marrow edema",
        ]
    if has("ankle", "foot"):
        return [
            "Tibiotalar / subtalar joints — articular cartilage, effusion",
            "Anterior and posterior talofibular ligaments, calcaneofibular ligament",
            "Deltoid ligament complex",
            "Achilles tendon, peroneal tendons, tibialis posterior",
            "Spring ligament, plantar fascia",
            "Bones — fractures, marrow edema, osteochondral lesions",
        ]
    if has("hip", "pelvic"):
        return [
            "Femoral head and acetabulum — articular cartilage, labrum",
            "Marrow signal — AVN, fracture, lesion",
            "Hip joint effusion",
            "Surrounding tendons — gluteal, iliopsoas, hamstring origins",
            "Sacroiliac joints",
            "Surrounding muscles and soft tissues",
        ]
    return []


def _sequence_hint(label: str, modality: str) -> str:
    """Translate an MRI series description into a plain-English hint
    about what the images emphasize. Without this the model defaults
    to CT-style 'low/high attenuation' language even when looking at
    a T2 fat-sat slice.
    """
    if modality.upper() != "MR" or not label:
        return ""
    import re
    # Tokenize: keep letters+digits, separate by whitespace/punctuation
    raw = re.sub(r"[^A-Za-z0-9]+", " ", label.upper())
    tokens = raw.split()
    token_set = set(tokens)

    def has(*words: str) -> bool:
        return any(w in token_set for w in words)

    # Fat suppression: explicit tokens, not the 'FS' inside 'FSE'
    has_fs = (
        has("FS", "FATSAT", "SPAIR", "STIR", "SPIR")
        or ("FAT" in token_set and "SAT" in token_set)
    )

    # Order matters: check the most specific labels first (FLAIR, STIR,
    # DWI) before the generic T1/T2/PD families.
    if has("LOC", "LOCALIZER", "SCOUT", "SURVEY"):
        return (
            "Localizer/scout — orientation reference, not a diagnostic "
            "sequence; do not base findings on it."
        )
    if has("FLAIR"):
        return (
            "FLAIR — fluid-attenuated T2; CSF is dark, parenchymal edema "
            "and white matter lesions are hyperintense."
        )
    if has("DWI", "DIFF", "DIFFUSION"):
        return (
            "Diffusion-weighted — restricted diffusion appears hyperintense "
            "(correlate with ADC map if available)."
        )
    if has("STIR"):
        return (
            "STIR — short tau inversion recovery; fluid, edema, and marrow "
            "lesions are hyperintense, fat is suppressed."
        )
    if has("T2"):
        if has_fs:
            return (
                "T2-weighted with fat suppression — free fluid, edema, and "
                "synovial pathology are hyperintense (bright); fat is dark."
            )
        return (
            "T2-weighted — fluid (effusion, edema, cysts) is hyperintense; "
            "fat is moderately bright; cortical bone and ligaments are dark."
        )
    if has("PD"):
        if has_fs:
            return (
                "Proton-density with fat suppression — best sequence for "
                "cartilage, menisci, ligaments, and subtle marrow edema."
            )
        return (
            "Proton-density — intermediate contrast; cartilage and meniscus "
            "morphology are well shown; fluid is moderately bright."
        )
    if has("T1"):
        if has_fs:
            return (
                "T1-weighted with fat suppression — useful for post-contrast "
                "enhancement and marrow lesions; fat is suppressed."
            )
        return (
            "T1-weighted — anatomical map; fat is bright, fluid is dark, "
            "fibrocartilage and ligaments are dark, marrow is intermediate."
        )
    if has_fs:
        return "Fat-suppressed sequence."
    return ""


def produce_report(
    volume: np.ndarray,
    *,
    modality: str,
    study_description: str = "",
    physician_notes: str = "",
    analysis_focus: str = "",
    custom_task: str = "",
    slice_count: int = 12,
    image_plane: str = "unknown",
    body_part: str = "",
    pixel_spacing: str = "",
    slice_thickness: float | None = None,
    series_description: str = "",
    laterality: str = "",
    protocol_name: str = "",
    clinical_context: str = "",
) -> dict:
    """Run a structured radiology read on a representative sample.

    For coverage on large studies (e.g. 134 slices), sample up to
    MAX_SAMPLE_SLICES anatomically-spaced positions. Sending every
    slice is infeasible — GPT-5 Vision has a per-request image
    budget and the cost scales linearly.

    Returns {"ok": True, "report": <text>, "slices_analyzed": int,
    "slices_total": int, "indices": list[int], "model": str}
    or {"ok": False, "error": <str>}.
    """
    try:
        total = int(volume.shape[0])
        count = max(1, min(int(slice_count), MAX_SAMPLE_SLICES, total))
        indices = _representative_indices(total, count)

        # Build the image payload tied to the same indices we report on.
        images: list[dict] = []
        for idx in indices:
            b64 = _windowed_b64_png(volume[idx], modality)
            images.append(
                {"type": "text", "text": f"[Slice {idx + 1}/{total}]"}
            )
            images.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/png;base64,{b64}",
                        "detail": "high",
                    },
                }
            )

        # Build technical context. The scan plane line is critical:
        # without it the model has been inventing 'coronal' and
        # 'sagittal' reformats when the actual series is purely axial.
        tech_lines = [
            f"Modality: {modality}",
            f"Study description: {study_description or 'not specified'}",
        ]
        # Sequence-aware context for MRI (huge signal for the model:
        # what's bright on T1 ≠ what's bright on T2 ≠ what's bright on
        # PD-FS). Without this the model defaults to CT-style language.
        seq_label = series_description or protocol_name
        if seq_label:
            tech_lines.append(f"Series: {seq_label}")
            hint = _sequence_hint(seq_label, modality)
            if hint:
                tech_lines.append(f"Sequence interpretation: {hint}")
        if laterality:
            tech_lines.append(
                f"Laterality: {laterality} "
                f"({'right' if laterality.upper().startswith('R') else 'left' if laterality.upper().startswith('L') else 'unspecified'})"
            )
        if body_part:
            tech_lines.append(f"Body part examined: {body_part}")
        plane_clean = (image_plane or "unknown").lower()
        if plane_clean in ("axial", "coronal", "sagittal"):
            tech_lines.append(
                f"Scan plane: ALL {total} slices are {plane_clean} (per DICOM ImageOrientationPatient). "
                f"DO NOT refer to any slice as belonging to a different plane unless multiple series "
                f"with different orientations are explicitly noted in the description."
            )
        elif plane_clean == "oblique":
            tech_lines.append(
                f"Scan plane: oblique (slice normal is not aligned with a cardinal axis). "
                f"Describe orientation as 'oblique' rather than axial/coronal/sagittal."
            )
        else:
            tech_lines.append(
                "Scan plane: not encoded in the DICOM headers. "
                "Do NOT assert axial/coronal/sagittal unless the image content makes it unambiguous."
            )
        if pixel_spacing:
            tech_lines.append(f"Pixel spacing (mm): {pixel_spacing}")
        if slice_thickness:
            tech_lines.append(f"Slice thickness (mm): {slice_thickness}")

        # Quantitative intensity range across the sampled volume — a
        # hard tie-breaker for the modality question. CT data covers
        # the Hounsfield scale (≈ -1000 air, 0 water, +1000 bone, with
        # rescale already applied); MRI signal sits on an arbitrary
        # positive scale with no fixed anchor. If the model is tempted
        # to override the DICOM-stated modality, these numbers anchor
        # it back to reality.
        try:
            v_min = float(volume.min())
            v_max = float(volume.max())
            tech_lines.append(
                f"Intensity range across sampled volume: "
                f"min={v_min:.0f}, max={v_max:.0f}. "
                + ("Consistent with HU (CT)." if (v_min < -200 and modality.upper() == "CT")
                   else "Non-Hounsfield positive scale (typical of MRI signal)."
                   if (v_min >= 0 and modality.upper().startswith("MR"))
                   else "Range consistent with the stated modality.")
            )
        except Exception:
            pass

        # Clinical context — the single biggest lever for getting a
        # report that reads like a real consultant's. The physician's
        # history, complaint, mechanism, prior imaging, and labs go
        # here. The system prompt instructs the model to place this
        # block under a 'Clinical context:' header in the report.
        ctx_block = (clinical_context or "").strip()
        if ctx_block:
            ctx_line = (
                "PHYSICIAN'S CLINICAL CONTEXT (use this to focus the "
                "report and choose the primary diagnosis decisively. "
                "Include the relevant parts of this context verbatim "
                "under a 'Clinical context:' line in your report):\n"
                f"\"\"\"\n{ctx_block}\n\"\"\""
            )
        else:
            ctx_line = (
                "PHYSICIAN'S CLINICAL CONTEXT: none provided. Under the "
                "'Clinical context:' header in the report write "
                "'Not provided — read as screening.'"
            )

        user_text_parts = list(tech_lines) + [
            ctx_line,
            f"Physician notes: {physician_notes or 'none'}",
            f"Slices in the SELECTED SERIES (volume passed to you): {total}",
            (
                "Note: This count is for the selected series only. The full study "
                "may contain additional series in other planes/sequences that are "
                "not part of this read."
            ),
            f"Slices sampled for this read: {len(indices)} "
            f"(indices {', '.join(str(i + 1) for i in indices)})",
            (
                "Windowing was auto-adjusted per slice using 1st-99th "
                "percentile clipping to avoid saturation across mixed "
                "anatomy (brain/lung/bone/soft tissue). Treat each image "
                "as a contrast-balanced preview of that level."
            ),
        ]

        # Anatomy whitelist — stop the model fabricating findings
        # outside the body region under examination ('knee' / 'distal
        # leg' / 'craniofacial' on a prostate MRI). The whitelist is
        # the ONLY anatomy that may be discussed.
        canonical_region, allowed_anatomy = _anatomy_whitelist(
            body_part, series_description or study_description
        )
        if allowed_anatomy:
            user_text_parts.append(
                f"REGION UNDER EXAMINATION: {canonical_region}.\n"
                f"ALLOWED ANATOMY (the ONLY structures you may name in this "
                f"report — DO NOT invent findings outside this list):\n"
                + "\n".join(f"  - {item}" for item in allowed_anatomy)
                + "\n\nIMPORTANT: series-name suffixes like 'tra', 'sag', "
                f"'cor', 'ax', 'MPR', 'ND' are PLANE / RECONSTRUCTION "
                f"abbreviations (transverse, sagittal, coronal, axial, "
                f"multiplanar reformat, no-distortion). They are NEVER "
                f"body parts. Do not mention 'knee', 'leg', 'head', or any "
                f"region not on the allowed list above."
            )

        # Region-specific structural checklist. Each item that is visible
        # on the submitted slices must be addressed; items not assessable
        # on this sequence/plane must be explicitly called out as 'not
        # assessed on this set' rather than silently omitted.
        checklist = _anatomical_checklist(body_part, series_description or study_description)
        if checklist:
            user_text_parts.append(
                "Anatomical checklist for this region — address EACH item "
                "explicitly in the Findings (state 'not assessed on this "
                "set' for items not visible on the submitted images, "
                "rather than skipping):\n"
                + "\n".join(f"  - {item}" for item in checklist)
            )

        # Region-appropriate scoring system reminder (PI-RADS / LI-RADS /
        # Lung-RADS / Kellgren-Lawrence / etc.). The consultant report
        # always uses the standard scoring framework by name.
        scoring = _scoring_system_hint(body_part, series_description or study_description, modality)
        if scoring:
            user_text_parts.append(
                "REQUIRED SCORING SYSTEM — use it by name in the report:\n"
                + scoring
            )

        # Few-shot style anchor — a short anonymized consultant report so
        # the model emulates brevity, bullets, measurements, scoring, and
        # decisive Impression wording (matched to references provided by
        # the user's wife: مركز الأمل، الرواد، الزهور).
        user_text_parts.append(
            "STYLE TEMPLATE — emulate the EXACT format, brevity, "
            "measurement density, and decisive Impression of this real "
            "consultant report (do NOT copy its content, only its style):\n\n"
            "==========\n"
            "Procedure: Multiparametric multiplanar non-contrast MRI of the prostate.\n"
            "Technique: T2WI multiplanar, DWI (b=2000), ADC map, MR spectroscopy.\n"
            "Clinical context: 65 y/o male, PSA 12 ng/mL, dysuria.\n"
            "Morphology:\n"
            "  Prostate:\n"
            "    • Markedly enlarged, 5.3 × 3.9 × 4.4 cm ≈ 43 cc.\n"
            "    • Malignant-featuring focal lesion at left peripheral zone.\n"
            "    • Predominantly T2 hypointense, infiltrating left lateral bundle, "
            "extracapsular extension into left seminal vesicle.\n"
            "    • Restricted diffusion, ADC = 0.4 × 10⁻³ mm²/sec (benign > 1×10⁻³).\n"
            "    • MR spectroscopy: choline elevation, citrate reduction, "
            "(Cho+Cr)/Cit ratio = 6.8 (benign < 0.5).\n"
            "  Lymph nodes: symmetric pelvic LN, largest 13 mm at left iliac region.\n"
            "  Seminal vesicles: left infiltration as above; right intact.\n"
            "Impression:\n"
            "  1. Prostatic enlargement grade II with malignant-featuring left PZ "
            "lesion [PI-RADS 5] — for trans-rectal biopsy and PSMA-PET/CT "
            "correlation.\n"
            "  2. Suspicious left iliac lymphadenopathy 13 mm — correlate with "
            "PSMA-PET/CT staging.\n"
            "==========\n\n"
            "Apply this style to the case at hand. Be brief. Be decisive. "
            "Measure everything. Cite scoring systems by name."
        )

        if analysis_focus:
            user_text_parts.append(f"Focus area: {analysis_focus}")
        if custom_task:
            user_text_parts.append(
                "Additional task requested by the physician:\n" + custom_task
            )
        user_text_parts.append(
            "\nProduce the SIGNED consultant report now, following the style "
            "template above and ALL rules in the system prompt. Reference "
            "specific slice numbers when describing regional findings. "
            "Hedging budget: ≤ 3 hedging words across the whole report. "
            "Impression: 3-5 boxed numbered lines, primary diagnosis first, "
            "ZERO hedging words."
        )

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [{"type": "text", "text": "\n".join(user_text_parts)}] + images,
            },
        ]
        # Scale the completion budget with the image count. GPT-5
        # reasoning tokens count against this budget, and they grow
        # roughly linearly with the number of medical images. A flat
        # 8K worked for 12-20 slices but starved the model on 30-40,
        # producing empty reports. Floor at 8K (proven), add ~600 per
        # image above 20, cap at 20K to keep the API call bounded but
        # generous enough for 40-slice reads.
        completion_budget = max(8000, min(20000, 8000 + 600 * max(0, len(indices) - 20)))
        report, usage = _chat_completion(messages, max_tokens=completion_budget)

        # Hedging gate — count fence-sitting words; if the first draft
        # exceeded the budget, ask the model to rewrite the Impression
        # decisively. One retry maximum to keep cost bounded.
        hedge_count, hedge_hits = _count_hedging(report)
        if hedge_count > 6 and report:
            retry_msg = (
                "Your draft contains too much hedging. Rewrite the report "
                "with these constraints: keep all factual findings and "
                "measurements; replace fence-sitting phrases "
                f"({', '.join(hedge_hits[:6])}) with decisive language; "
                "Impression MUST contain zero hedging words and must commit "
                "to a primary diagnosis with explicit action. Re-emit the "
                "complete report in the same structure."
            )
            retry_messages = messages + [
                {"role": "assistant", "content": report},
                {"role": "user", "content": retry_msg},
            ]
            try:
                rewritten, retry_usage = _chat_completion(
                    retry_messages, max_tokens=completion_budget
                )
                if rewritten:
                    report = rewritten
                    for k in ("prompt", "completion", "reasoning", "visible", "total"):
                        usage[k] = int(usage.get(k, 0) or 0) + int(retry_usage.get(k, 0) or 0)
            except Exception:
                pass  # fall back to the original draft if the retry trips

        return {
            "ok": True,
            "report": report,
            "slices_analyzed": len(indices),
            "slices_total": total,
            "indices": indices,
            "model": AI_MODEL,
            "usage": usage,
        }
    except Exception as e:
        return {"ok": False, "error": _format_error(e)}


def produce_full_study_report(
    *,
    load_volume_fn,
    series_list: list[dict],
    modality: str,
    study_description: str = "",
    physician_notes: str = "",
    analysis_focus: str = "",
    custom_task: str = "",
    body_part: str = "",
    laterality: str = "",
    slices_per_series: int = 15,
    progress=None,
) -> dict:
    """Multi-series 'Full Study' read.

    Walks every diagnostic series in the study (skipping localizers),
    calls produce_report once per series with that series's volume,
    then synthesizes the partial reports into a single unified report.

    `load_volume_fn(series_uid) -> np.ndarray` is supplied by the
    caller so we don't hard-code a database session inside the LLM
    module. `series_list` is the list of dicts produced by
    `_list_series_in_study` in app.py — each carries description,
    plane, pixel_spacing, etc.

    Returns the usual produce_report-style dict, with the unified
    report under 'report' and the per-series partials under 'partials'
    for the UI to expand if the doctor wants the raw reads.
    """
    diagnostic = [
        s for s in series_list
        if not is_localizer(s.get("description", ""), s.get("protocol_name", ""))
        and (s.get("count") or 0) >= 3
    ]
    if not diagnostic:
        return {
            "ok": False,
            "error": (
                "لم أعثر على سلاسل تشخيصية صالحة في الدراسة (فقط localizers/scouts). / "
                "No diagnostic series found in this study (only localizers/scouts)."
            ),
        }

    partials: list[dict] = []
    failures: list[str] = []
    total_usage = {"prompt": 0, "completion": 0, "reasoning": 0, "visible": 0, "total": 0}

    for i, s in enumerate(diagnostic):
        description = s.get("description") or f"Series {s.get('series_number') or i + 1}"
        if progress:
            progress(i, len(diagnostic), description)

        try:
            volume = load_volume_fn(s["series_uid"])
        except Exception as e:
            failures.append(f"{description}: load failed ({e})")
            continue
        if volume is None or getattr(volume, "size", 0) == 0:
            failures.append(f"{description}: empty after decode")
            continue

        try:
            slice_thickness = float(s.get("slice_thickness") or 0) or None
        except (TypeError, ValueError):
            slice_thickness = None

        result = produce_report(
            volume=volume,
            modality=modality,
            study_description=study_description,
            physician_notes=physician_notes,
            analysis_focus=analysis_focus,
            # The custom task is injected ONCE in the synthesis step,
            # not echoed per series.
            custom_task="",
            slice_count=min(slices_per_series, int(volume.shape[0])),
            image_plane=s.get("plane", "unknown"),
            body_part=body_part,
            pixel_spacing=s.get("pixel_spacing", ""),
            slice_thickness=slice_thickness,
            series_description=description,
            laterality=laterality,
            protocol_name=s.get("protocol_name", ""),
        )

        # Free the per-series volume before moving on so a 5-series
        # knee MRI doesn't stack five float32 volumes in RAM.
        del volume
        import gc
        gc.collect()

        if not result.get("ok"):
            failures.append(f"{description}: {result.get('error', 'unknown error')}")
            continue

        partials.append({
            "series_description": description,
            "plane": s.get("plane", "unknown"),
            "slices_total": result.get("slices_total", 0),
            "slices_analyzed": result.get("slices_analyzed", 0),
            "indices": result.get("indices", []),
            "report": result.get("report", ""),
            "usage": result.get("usage", {}),
        })
        for k in total_usage:
            total_usage[k] += int(result.get("usage", {}).get(k, 0) or 0)

    if not partials:
        return {
            "ok": False,
            "error": "All per-series reads failed:\n" + "\n".join(failures),
        }

    if progress:
        progress(len(diagnostic), len(diagnostic), "synthesizing")

    # Build the synthesis message
    side_phrase = ""
    if laterality and laterality.upper() != "NA":
        side_phrase = " (right)" if laterality.upper().startswith("R") else " (left)"
    header = (
        f"Modality: {modality}\n"
        f"Body part: {body_part or 'not specified'}{side_phrase}\n"
        f"Study description: {study_description or 'not specified'}\n"
        f"Physician notes: {physician_notes or 'none'}\n"
        f"Series read: {len(partials)} of {len(diagnostic)} diagnostic series "
        f"(localizers excluded).\n"
    )
    if analysis_focus:
        header += f"Analysis focus: {analysis_focus}\n"
    if custom_task:
        header += (
            "\nAdditional task requested by the physician (to be addressed "
            "in a final 'Additional Task / مهمة إضافية' section):\n"
            f"{custom_task}\n"
        )

    # Anatomy whitelist (same one as the per-series read uses) — keep
    # the synthesizer from inheriting any out-of-region hallucinations
    # that a single per-series read may have introduced.
    canonical_region, allowed_anatomy = _anatomy_whitelist(
        body_part, study_description
    )
    if allowed_anatomy:
        header += (
            f"\nREGION UNDER EXAMINATION: {canonical_region}.\n"
            f"ALLOWED ANATOMY (the ONLY structures the unified report may "
            f"mention — drop anything outside this list from the per-series "
            f"reads):\n"
            + "\n".join(f"  - {item}" for item in allowed_anatomy)
            + "\n"
        )

    per_series_block = "\n\n".join(
        f"=== Series {idx + 1}: {p['series_description']} ({p['plane']}) — "
        f"{p['slices_analyzed']}/{p['slices_total']} slices analyzed ===\n"
        f"{p['report']}"
        for idx, p in enumerate(partials)
    )

    synthesis_messages = [
        {"role": "system", "content": SYSTEM_PROMPT + "\n\n" + _SYNTHESIS_INSTRUCTION},
        {
            "role": "user",
            "content": (
                header
                + "\n--- Per-series reads ---\n\n"
                + per_series_block
                + "\n\n--- End of per-series reads ---\n\n"
                "Produce the unified structured report now."
            ),
        },
    ]

    try:
        # Synthesis is text-only (no images) but reasoning over 5-7
        # partial reports — each up to 2000 tokens — is heavy. Give
        # GPT-5 a 12K budget so the unified report doesn't come back
        # empty when several sequences are being woven together.
        final_report, syn_usage = _chat_completion(
            synthesis_messages, max_tokens=12000
        )
    except Exception as e:
        return {
            "ok": False,
            "error": _format_error(e),
            "partials": partials,  # at least show the per-series reads
            "usage": total_usage,
        }

    for k in total_usage:
        total_usage[k] += int(syn_usage.get(k, 0) or 0)

    # Hedging gate on the unified report. The synthesis step amplifies
    # any uncertainty from the per-series reads, so we re-check here.
    hedge_count, hedge_hits = _count_hedging(final_report)
    if hedge_count > 6 and final_report:
        retry_msg = (
            "Your synthesized report contains too much hedging. Rewrite "
            "it preserving all factual findings, measurements, and the "
            "section structure; replace fence-sitting phrases "
            f"({', '.join(hedge_hits[:6])}) with decisive language; "
            "Impression MUST contain zero hedging words and must commit "
            "to a primary diagnosis with explicit action."
        )
        retry_messages = synthesis_messages + [
            {"role": "assistant", "content": final_report},
            {"role": "user", "content": retry_msg},
        ]
        try:
            rewritten, retry_usage = _chat_completion(
                retry_messages, max_tokens=12000
            )
            if rewritten:
                final_report = rewritten
                for k in total_usage:
                    total_usage[k] += int(retry_usage.get(k, 0) or 0)
        except Exception:
            pass

    return {
        "ok": True,
        "report": final_report,
        "partials": partials,
        "failures": failures,
        "model": AI_MODEL,
        "usage": total_usage,
        "series_count": len(partials),
        "series_total": len(diagnostic),
    }


def synthesize_partial_reports(
    *,
    partials: list[dict],
    modality: str,
    study_description: str = "",
    physician_notes: str = "",
    body_part: str = "",
    laterality: str = "",
    analysis_focus: str = "",
    custom_task: str = "",
    clinical_context: str = "",
) -> dict:
    """Combine per-series partial reports into ONE unified report.

    Lets the UI process series one-at-a-time (each call a fresh
    Streamlit script run, so the WebSocket stays alive and partials
    survive a disconnect) and call this synthesis step at the very
    end.

    Each entry in `partials` is the dict the UI built when a per-
    series produce_report() succeeded: {series_description, plane,
    slices_total, slices_analyzed, indices, report}.

    Returns {"ok": True, "report": str, "usage": dict} or
    {"ok": False, "error": str, "usage": dict}.
    """
    if not partials:
        return {
            "ok": False,
            "error": "No per-series partial reports to synthesize.",
            "usage": {"prompt": 0, "completion": 0, "reasoning": 0, "visible": 0, "total": 0},
        }

    side_phrase = ""
    if laterality and laterality.upper() != "NA":
        side_phrase = " (right)" if laterality.upper().startswith("R") else " (left)"
    header = (
        f"Modality: {modality}\n"
        f"Body part: {body_part or 'not specified'}{side_phrase}\n"
        f"Study description: {study_description or 'not specified'}\n"
        f"Physician notes: {physician_notes or 'none'}\n"
        f"Series read: {len(partials)} diagnostic series.\n"
    )
    ctx = (clinical_context or "").strip()
    if ctx:
        header += (
            "\nPHYSICIAN'S CLINICAL CONTEXT (place under a 'Clinical "
            "context:' line in the unified report; use it to pick the "
            "primary diagnosis decisively):\n"
            f"\"\"\"\n{ctx}\n\"\"\"\n"
        )
    if analysis_focus:
        header += f"Analysis focus: {analysis_focus}\n"
    if custom_task:
        header += (
            "\nAdditional task requested by the physician (to be addressed "
            "in a final 'Additional Task / مهمة إضافية' section):\n"
            f"{custom_task}\n"
        )

    per_series_block = "\n\n".join(
        f"=== Series {idx + 1}: {p.get('series_description', '?')} "
        f"({p.get('plane', '?')}) — "
        f"{p.get('slices_analyzed', 0)}/{p.get('slices_total', 0)} slices analyzed ===\n"
        f"{p.get('report', '')}"
        for idx, p in enumerate(partials)
    )

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT + "\n\n" + _SYNTHESIS_INSTRUCTION},
        {
            "role": "user",
            "content": (
                header
                + "\n--- Per-series reads ---\n\n"
                + per_series_block
                + "\n\n--- End of per-series reads ---\n\n"
                "Produce the unified structured report now."
            ),
        },
    ]
    try:
        final_report, usage = _chat_completion(messages, max_tokens=12000)
        return {"ok": True, "report": final_report, "usage": usage}
    except Exception as e:
        return {
            "ok": False,
            "error": _format_error(e),
            "usage": {"prompt": 0, "completion": 0, "reasoning": 0, "visible": 0, "total": 0},
        }


def chat_about_study(
    *,
    question: str,
    history: list[dict],
    volume: np.ndarray | None,
    modality: str,
    study_description: str,
    prior_report: str = "",
) -> tuple[str, dict]:
    """Answer one question with a fresh middle-slice image attached.

    `history` is a list of {"role": "user"|"assistant", "content": str}.

    Returns (reply, usage) where usage is the token-accounting dict
    from _chat_completion (zeros if the call failed).
    """
    messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]

    context_lines = [
        f"Modality: {modality}",
        f"Study description: {study_description or 'not specified'}",
    ]
    if prior_report:
        context_lines.append("\nMost recent structured report on this study:\n" + prior_report)

    if volume is not None and volume.size > 0:
        b64 = _windowed_b64_png(volume[volume.shape[0] // 2], modality)
        messages.append(
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "\n".join(context_lines)},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{b64}",
                            "detail": "high",
                        },
                    },
                ],
            }
        )
    else:
        messages.append({"role": "user", "content": "\n".join(context_lines)})

    # Replay the last 8 turns so the model has near-term context.
    for turn in history[-8:]:
        role = turn.get("role")
        if role in ("user", "assistant"):
            messages.append({"role": role, "content": turn.get("content", "")})

    messages.append({"role": "user", "content": question})

    try:
        # Chat needs less reasoning headroom — single image, focused
        # question — but still bump it well above the visible answer
        # length to avoid empty replies on reasoning-heavy turns.
        return _chat_completion(messages, max_tokens=4000)
    except Exception as e:
        return f"❌ {_format_error(e)}", {
            "prompt": 0, "completion": 0, "reasoning": 0, "visible": 0, "total": 0,
        }


def _format_error(e: Exception) -> str:
    msg = str(e)
    if isinstance(e, EmptyCompletion):
        return (
            "النموذج أعاد رداً فارغاً (استهلكت موارد التفكير الميزانية كاملة). "
            "قلّل عدد الشرائح في المنزلق و حاول مرة أخرى. / "
            "Model returned an empty reply (reasoning consumed the whole budget). "
            "Reduce the slice count slider and try again."
        )
    if "FREE_CLOUD_BUDGET_EXCEEDED" in msg:
        return (
            "تم تجاوز حد الاستخدام. تحقق من رصيد حساب OpenAI الخاص بك. / "
            "Usage limit exceeded. Check your OpenAI account balance."
        )
    if "RateLimit" in msg or "rate_limit" in msg:
        return f"تجاوز معدل الطلبات، حاول لاحقاً. / Rate limit reached: {msg}"
    return f"خطأ من خادم OpenAI / OpenAI server error: {msg}"
