"""
Dual-Channel Output Separation & Inter-Agent Handover Engine for OmniTask AI.
Cleanly separates user-facing deliverables from internal coordination, metadata,
and directives intended for downstream AI specialist agents.
"""
import re
import json
from typing import Tuple, Dict, Any, Optional

def extract_and_sanitize_handover(
    raw_output: str,
    primary_objective: str = "",
    domain: str = ""
) -> Tuple[str, Dict[str, Any]]:
    """
    Splits raw LLM output into:
    1. clean_user_deliverable: Pure, polished output meant for user display.
    2. internal_handover: Structured dictionary containing instructions, parameters,
       chosen entities, or metadata meant specifically for downstream AI agents on the Blackboard.
    """
    if not raw_output:
        return "", {}

    text = raw_output
    handover: Dict[str, Any] = {}

    def try_parse_payload(content_str: str) -> bool:
        """Attempts to parse JSON or key-value content into handover dict."""
        if not content_str:
            return False
        clean_content = content_str.strip()
        # Strip markdown code blocks if wrapped: ```json ... ``` or ``` ... ```
        if clean_content.startswith("```"):
            clean_content = re.sub(r"^```(?:json)?\s*", "", clean_content, flags=re.IGNORECASE)
            clean_content = re.sub(r"\s*```$", "", clean_content)
            clean_content = clean_content.strip()

        # Try json.loads
        try:
            parsed = json.loads(clean_content)
            if isinstance(parsed, dict):
                handover.update(parsed)
                return True
        except Exception:
            pass

        # Try regex extraction of JSON object if embedded in text
        json_obj_m = re.search(r"\{[\s\S]*?\}", clean_content)
        if json_obj_m:
            try:
                parsed = json.loads(json_obj_m.group(0))
                if isinstance(parsed, dict):
                    handover.update(parsed)
                    return True
            except Exception:
                pass

        # Key-value fallback: target_subject: ..., secret_answer: ...
        found_any = False
        for line in clean_content.splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                k_norm = k.strip().lower().replace(" ", "_").strip('"\'')
                v_norm = v.strip().strip('"\'').rstrip(",")
                if k_norm in [
                    "target_subject", "secret_answer", "answer", "subject",
                    "recommended_image_prompt", "directives", "key"
                ]:
                    handover[k_norm] = v_norm
                    found_any = True
        return found_any

    # 1. Flexible regex for <agent_handover> or <agent-handover> or <handover>
    # Supports </agent_handover>, unslashed <agent_handover>, or end of string as closing tag!
    handover_pattern = r"<\s*(?:agent[-_]?)?handover\s*>([\s\S]*?)(?:<\s*/?\s*(?:agent[-_]?)?handover\s*>|$)"
    for m in re.finditer(handover_pattern, text, flags=re.IGNORECASE):
        try_parse_payload(m.group(1))

    # Strip all <agent_handover> blocks completely
    text = re.sub(handover_pattern, "", text, flags=re.IGNORECASE)
    # Extra safety: strip any leftover stray tags
    text = re.sub(r"<\s*/?\s*(?:agent[-_]?)?handover\s*>", "", text, flags=re.IGNORECASE)

    # 2. Extract <secret_answer>...</secret_answer> or unslashed <secret_answer>...<secret_answer> or end of string
    secret_pattern = r"<\s*secret[-_]?answer\s*>([\s\S]*?)(?:<\s*/?\s*secret[-_]?answer\s*>|$)"
    for sm in re.finditer(secret_pattern, text, flags=re.IGNORECASE):
        s_val = sm.group(1).strip()
        if s_val:
            handover["secret_answer"] = s_val
            handover.setdefault("target_subject", s_val)
    text = re.sub(secret_pattern, "", text, flags=re.IGNORECASE)
    text = re.sub(r"<\s*/?\s*secret[-_]?answer\s*>", "", text, flags=re.IGNORECASE)

    # 3. Extract <!-- AGENT_HANDOVER: ... --> comments
    comment_pattern = r"<!--\s*(?:AGENT_HANDOVER|INTERNAL_DIRECTIVE|DOWNSTREAM_INSTRUCTIONS):\s*([\s\S]*?)\s*-->"
    for cm in re.finditer(comment_pattern, text, flags=re.IGNORECASE):
        try_parse_payload(cm.group(1))
    text = re.sub(comment_pattern, "", text, flags=re.IGNORECASE)

    # 4. Extract parenthetical or conversational notes directed at other agents/tools
    leak_regexes = [
        r"\n*\(\s*(?:For the (?:requested|next|downstream) (?:image|visual|asset)|Note (?:for|to) (?:the )?(?:image|visual|next) agent|Please produce (?:an?|the) (?:picture|image|photo) of)\s*[:\-]?\s*([^)\n]+)\)\s*$",
        r"\n*\(For the requested image[\s\S]*?\)\s*$",
        r"\n*\(\s*(?:Note|Instructions?|Directive) (?:to|for) (?:the )?(?:next|downstream|subsequent) (?:agent|step|model)\s*[:\-]?\s*([^)\n]+)\)\s*$"
    ]

    for pat in leak_regexes:
        m = re.search(pat, text, flags=re.IGNORECASE)
        if m:
            matched_str = m.group(0)
            if not handover.get("target_subject") and not handover.get("secret_answer"):
                subj_m = re.search(
                    r"(?:picture of a|picture of an|picture of|produce a|produce an|image of a|image of an|render a|render an)\s+([a-zA-Z0-9\s_-]+?)(?:\.|\)|$)",
                    matched_str,
                    flags=re.IGNORECASE
                )
                if subj_m:
                    extracted_subj = subj_m.group(1).strip().rstrip(".)")
                    if extracted_subj:
                        handover["target_subject"] = extracted_subj
                        handover["secret_answer"] = extracted_subj
            handover["downstream_directive"] = matched_str.strip("()\n ")
            text = text[:m.start()] + text[m.end():]

    # 5. Extract trailing raw JSON if an agent output raw handover JSON at the very end
    trailing_json_m = re.search(r"\n+\s*(\{[\s\S]*\"(?:target_subject|secret_answer|recommended_image_prompt)\"[\s\S]*\})\s*$", text)
    if trailing_json_m:
        if try_parse_payload(trailing_json_m.group(1)):
            text = text[:trailing_json_m.start()]

    # 6. Handle Secrecy / Riddle / Guessing game constraints
    is_secrecy_requested = any(w in primary_objective.lower() for w in [
        "dont tell the answer", "don't tell the answer", "dont give the answer", "don't give the answer",
        "not tell the answer", "without telling the answer", "dont reveal the answer", "don't reveal the answer",
        "never revealed", "never reveal", "never state", "riddle", "guess", "spoiler", "secret"
    ])

    if is_secrecy_requested:
        # Strip trailing Answer/Solution reveals if leaked in text
        reveal_m = re.search(r"\n*(?:Answer|Solution|Secret Answer|The answer is|Target subject|Secret object)\s*[:\-]\s*([^\n]+)\s*$", text, flags=re.IGNORECASE)
        if reveal_m:
            if not handover.get("secret_answer"):
                handover["secret_answer"] = reveal_m.group(1).strip()
                handover.setdefault("target_subject", reveal_m.group(1).strip())
            text = text[:reveal_m.start()].strip()

    # Clean up whitespace
    clean_text = re.sub(r"\n{3,}", "\n\n", text).strip()

    return clean_text, handover

def sanitize_display_output(text: str) -> str:
    """Helper to sanitize output and strip internal coordination tags for clean document compilation."""
    if not text:
        return ""
    clean, _ = extract_and_sanitize_handover(text)
    return clean
