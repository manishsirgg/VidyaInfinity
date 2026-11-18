import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeInstituteWebsite,
  parseInstituteSocialLinks,
  readInstituteSocialLinks,
} from "../../lib/institutes/social-links.ts";

const parse = (links) => parseInstituteSocialLinks(JSON.stringify(links));

test("normalizes all six profile links and strips tracking, fragments, and redirect parameters", () => {
  const links = {
    facebook: "https://m.facebook.com/profile.php?id=1234&next=https://example.com",
    instagram: "https://instagram.com/vidya.infinity?igsh=tracking",
    youtube: "https://m.youtube.com/@vidya-infinity/videos#featured",
    linkedin: "https://in.linkedin.com/company/vidya-infinity/?trk=tracking",
    x: "https://mobile.twitter.com/VidyaInfinity?ref=tracking",
    whatsapp: "+91 (98765) 43210",
  };
  const expected = {
    facebook: "https://www.facebook.com/profile.php?id=1234",
    instagram: "https://www.instagram.com/vidya.infinity/",
    youtube: "https://www.youtube.com/@vidya-infinity/videos",
    linkedin: "https://www.linkedin.com/company/vidya-infinity/",
    x: "https://x.com/VidyaInfinity",
    whatsapp: "https://wa.me/919876543210",
  };
  assert.deepEqual(parse(links), { links: expected });
  assert.deepEqual(readInstituteSocialLinks(expected), expected);
});

test("accepts recognized profile routes and WhatsApp chat URL variants", () => {
  for (const [key, input, expected] of [
    ["facebook", "https://facebook.com/people/Example-School/10001/", "https://www.facebook.com/people/Example-School/10001"],
    ["youtube", "https://youtube.com/channel/UCabc123_-", "https://www.youtube.com/channel/UCabc123_-"],
    ["youtube", "https://youtube.com/@%E0%A4%B5%E0%A4%BF%E0%A4%A6%E0%A5%8D%E0%A4%AF%E0%A4%BE", "https://www.youtube.com/@%E0%A4%B5%E0%A4%BF%E0%A4%A6%E0%A5%8D%E0%A4%AF%E0%A4%BE"],
    ["linkedin", "https://linkedin.com/in/vidya/", "https://www.linkedin.com/in/vidya/"],
    ["whatsapp", "https://api.whatsapp.com/send?phone=%2B919876543210&text=hello", "https://wa.me/919876543210"],
    ["whatsapp", "https://wa.me/919876543210?text=hello", "https://wa.me/919876543210"],
  ]) {
    assert.deepEqual(parse({ [key]: input }), { links: { [key]: expected } }, input);
  }
});

test("distinguishes omission, editing, and intentional clearing", () => {
  assert.deepEqual(parseInstituteSocialLinks(null), { links: undefined });
  assert.deepEqual(parse({ facebook: "", x: "https://x.com/newname", whatsapp: null }), {
    links: { x: "https://x.com/newname" },
  });
  for (const input of [null, {}, { facebook: "", whatsapp: "   " }]) {
    assert.deepEqual(parse(input), { links: null });
  }
});

test("rejects non-HTTPS, deceptive domains, redirect endpoints, non-profile paths, and invalid numbers", () => {
  for (const [key, input] of [
    ["facebook", "javascript:alert(1)"],
    ["facebook", "data:text/html,hi"],
    ["facebook", "file:///etc/passwd"],
    ["facebook", "http://facebook.com/example"],
    ["facebook", "https://facebook.com.evil.example/example"],
    ["facebook", "https://evil.example@facebook.com/example"],
    ["facebook", "https://facebook.com@evil.example/example"],
    ["facebook", "https://l.facebook.com/l.php?u=https://example.com"],
    ["facebook", "https://www.facebook.com/l.php?u=https://example.com"],
    ["facebook", "https://facebook.com/profile.php?id=1&id=2"],
    ["instagram", "https://www.instagram.com/accounts/login/?next=https://example.com"],
    ["instagram", "https://instagram.com:8443/example"],
    ["youtube", "https://youtube.com/redirect?q=https://example.com"],
    ["youtube", "https://youtube.com/@example%2Fvideos"],
    ["linkedin", "https://linkedin.com/posts/not-a-profile"],
    ["x", "https://x.com/intent?url=https://example.com"],
    ["x", "https://x.com/account/status/123"],
    ["x", "https://x.com/".padEnd(513, "a")],
    ["whatsapp", "https://wa.me.evil.example/919876543210"],
    ["whatsapp", "https://wa.me/message/ABCD123"],
    ["whatsapp", "https://api.whatsapp.com/send?phone=919876543210&phone=11234567890"],
    ["whatsapp", "+01 234567890"],
    ["whatsapp", "+123"],
    ["whatsapp", "+1234567890123456"],
  ]) {
    assert.ok("error" in parse({ [key]: input }), input);
  }
  assert.ok("error" in parse({ x: 42 }));
  assert.ok("error" in parse({ website: "https://example.com" }));
  assert.ok("error" in parseInstituteSocialLinks("{broken"));
});

test("public reads omit missing and unsafe links", () => {
  assert.deepEqual(readInstituteSocialLinks(null), {});
  assert.deepEqual(readInstituteSocialLinks(["https://x.com/example"]), {});
  assert.deepEqual(readInstituteSocialLinks({
    x: "https://x.com/example",
    instagram: "https://instagram.com.evil.example/account",
    facebook: null,
    whatsapp: "bad",
  }), { x: "https://x.com/example" });
  assert.equal(normalizeInstituteWebsite("https://example.edu/admissions"), "https://example.edu/admissions");
  assert.equal(normalizeInstituteWebsite("http://example.edu"), null);
  assert.equal(normalizeInstituteWebsite("https://user@example.edu"), null);
  assert.equal(normalizeInstituteWebsite("javascript:alert(1)"), null);
});
