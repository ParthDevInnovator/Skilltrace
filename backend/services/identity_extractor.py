"""Conservative, nullable identity hints from explicit resume text."""
import re
from urllib.parse import urlsplit, urlunsplit

from pydantic import BaseModel, EmailStr, Field, TypeAdapter, ValidationError


class ExtractedIdentity(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None
    location: str | None = None
    headline: str | None = None
    experience_years: float | None = Field(default=None, ge=0)
    github: str | None = None
    linkedin: str | None = None
    leetcode: str | None = None


def extract_identity(raw_text: str) -> ExtractedIdentity:
    lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
    values = {}
    for key, labels in {"full_name": "(?:full name|name)", "location": "(?:location|based in)",
                        "headline": "(?:headline|title|role)"}.items():
        match = re.search(rf"^\s*{labels}\s*:\s*(.+)$", raw_text, re.I | re.M)
        if match:
            values[key] = match.group(1).strip()
    if "full_name" not in values:
        for line in lines[:5]:
            words = line.split()
            if (2 <= len(words) <= 6 and all(all(c.isalpha() or c in "'-" for c in w) for w in words)
                    and not re.search(r"resume|curriculum|synthetic|experience|engineer|developer|architect|manager|skills|education", line, re.I)):
                values["full_name"] = line
                break
    for email in re.findall(r"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", raw_text, re.I):
        try:
            values["email"] = TypeAdapter(EmailStr).validate_python(email)
            break
        except ValidationError:
            continue
    if "headline" not in values:
        for line in lines[:8]:
            if re.search(r"engineer|developer|architect|designer|scientist|manager", line, re.I) and len(line) <= 200 and not re.match(r"[-*\u2022]", line) and "@" not in line:
                values["headline"] = line
                break
    years = re.search(r"\b(\d{1,2}(?:\.\d+)?)\+?\s+years?\s+(?:of\s+)?(?:professional\s+)?experience\b", raw_text, re.I)
    if years:
        values["experience_years"] = float(years.group(1))
    for url in re.findall(r"(?<![\w.-])(?:https?://)?(?:www\.)?(?:github\.com|linkedin\.com|leetcode\.com)/[^\s<>]+", raw_text, re.I):
        url = url.rstrip(".,;:)]}")
        parsed = urlsplit(url if "://" in url else "https://" + url)
        host = (parsed.hostname or "").lower().removeprefix("www.")
        parts = [part for part in parsed.path.split("/") if part]
        platform = {"github.com": "github", "linkedin.com": "linkedin", "leetcode.com": "leetcode"}.get(host)
        if not platform or not parts or parsed.username or parsed.password or parsed.port:
            continue
        if platform == "github" and len(parts) != 1:
            continue
        if platform == "linkedin" and (len(parts) != 2 or parts[0].lower() != "in"):
            continue
        if platform == "leetcode" and not (len(parts) == 1 or len(parts) == 2 and parts[0].lower() == "u"):
            continue
        values.setdefault(platform, urlunsplit(("https", host, "/" + "/".join(parts), "", "")))
    return ExtractedIdentity(**values)
