import { readFileSync, writeFileSync } from "node:fs";
import { PDFDocument, degrees, rgb, StandardFonts } from "pdf-lib";

const OUT = "Campaign-Masters-UAE-Company-Profile.pdf";
const LOGO = "assets/campaign-masters-logo.png";

const W = 595.28;
const H = 841.89;

const C = {
  ink: rgb(0.05, 0.08, 0.15),
  ink2: rgb(0.09, 0.14, 0.25),
  white: rgb(1, 1, 1),
  indigo: rgb(0.35, 0.32, 0.95),
  indigoSoft: rgb(0.55, 0.52, 0.98),
  cyan: rgb(0.22, 0.83, 0.91),
  slate: rgb(0.28, 0.34, 0.45),
  slateLight: rgb(0.72, 0.78, 0.88),
  paper: rgb(0.97, 0.98, 1),
  card: rgb(1, 1, 1),
  line: rgb(0.87, 0.89, 0.94),
  amber: rgb(0.98, 0.75, 0.32),
};

function hex(value) {
  const raw = value.replace("#", "");
  return rgb(
    parseInt(raw.slice(0, 2), 16) / 255,
    parseInt(raw.slice(2, 4), 16) / 255,
    parseInt(raw.slice(4, 6), 16) / 255,
  );
}

const doc = await PDFDocument.create();
doc.setTitle("Campaign Masters UAE - Company Profile");
doc.setAuthor("Campaign Masters UAE");
doc.setSubject("Creator partnerships, brand collaborations and event activations across the Middle East");
doc.setKeywords(["creator marketing", "UAE agency", "event activation", "Instagram analytics", "Middle East"]);
doc.setCreator("Campaign Masters UAE");

const regular = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);
const logoImage = await doc.embedPng(readFileSync(LOGO));

function drawBackground(p, dark) {
  const tint = dark ? C.cyan : C.indigo;
  const alpha = dark ? 0.055 : 0.045;
  const nodes = [
    [40, 120], [150, 70], [265, 140], [390, 80], [520, 150],
    [75, 300], [210, 260], [350, 330], [500, 280],
    [45, 520], [180, 480], [320, 540], [470, 500],
    [90, 720], [240, 680], [400, 740], [540, 690],
  ];
  const links = [
    [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [1, 6], [2, 7], [3, 8],
    [5, 6], [6, 7], [7, 8], [5, 9], [6, 10], [7, 11], [8, 12],
    [9, 10], [10, 11], [11, 12], [9, 13], [10, 14], [11, 15], [12, 16],
  ];

  links.forEach(([a, b]) => {
    const [x1, t1] = nodes[a];
    const [x2, t2] = nodes[b];
    p.drawLine({
      start: { x: x1, y: H - t1 },
      end: { x: x2, y: H - t2 },
      thickness: 0.6,
      color: tint,
      opacity: alpha,
    });
  });
  nodes.forEach(([x, top], index) => {
    p.drawCircle({
      cx: x,
      cy: H - top,
      size: index % 4 === 0 ? 2.6 : 1.6,
      color: tint,
      opacity: alpha * 1.7,
    });
  });

  [[495, 610], [515, 580], [535, 545]].forEach(([x, top]) => {
    p.drawRectangle({
      x,
      y: 56,
      width: 12,
      height: H - 56 - top,
      color: tint,
      opacity: alpha * 1.2,
    });
  });

  text(p, "ANALYTICS  |  CONNECT  |  COLLABORATE", 26, 470, 8.5, bold, tint, {
    opacity: dark ? 0.07 : 0.06,
    rotate: degrees(-90),
    characterSpacing: 1.2,
  });
}

function page(dark = false) {
  const p = doc.addPage([W, H]);
  p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: dark ? C.ink : C.paper });
  drawBackground(p, dark);
  return p;
}

function rect(p, x, top, w, h, color, border = undefined, borderWidth = 1) {
  p.drawRectangle({
    x,
    y: H - top - h,
    width: w,
    height: h,
    color,
    ...(border ? { borderColor: border, borderWidth } : {}),
  });
}

function roundRect(p, x, top, w, h, color, radius = 10, border = undefined, borderWidth = 1) {
  const y = H - top - h;
  p.drawRectangle({ x: x + radius, y, width: w - radius * 2, height: h, color });
  p.drawRectangle({ x, y: y + radius, width: w, height: h - radius * 2, color });
  p.drawCircle({ cx: x + radius, cy: y + radius, size: radius, color });
  p.drawCircle({ cx: x + w - radius, cy: y + radius, size: radius, color });
  p.drawCircle({ cx: x + radius, cy: y + h - radius, size: radius, color });
  p.drawCircle({ cx: x + w - radius, cy: y + h - radius, size: radius, color });
  if (border) {
    p.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      borderColor: border,
      borderWidth,
      color: undefined,
    });
  }
}

function text(p, value, x, top, size, font = regular, color = C.ink, options = {}) {
  p.drawText(value, {
    x,
    y: H - top,
    size,
    font,
    color,
    ...options,
  });
}

function widthOf(value, size, font = regular) {
  return font.widthOfTextAtSize(value, size);
}

function centerText(p, value, centerX, top, size, font = regular, color = C.ink) {
  text(p, value, centerX - widthOf(value, size, font) / 2, top, size, font, color);
}

function wrap(value, font, size, maxWidth) {
  const words = value.split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (widthOf(candidate, size, font) <= maxWidth || current === "") {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function paragraph(p, value, x, top, size, maxWidth, color, font = regular, lineHeight = size * 1.5) {
  const lines = wrap(value, font, size, maxWidth);
  lines.forEach((line, index) => text(p, line, x, top + index * lineHeight, size, font, color));
  return top + lines.length * lineHeight;
}

function rule(p, x, top, w, color = C.line, thickness = 1) {
  p.drawLine({
    start: { x, y: H - top },
    end: { x: x + w, y: H - top },
    thickness,
    color,
  });
}

function eyebrow(p, label, x, top, dark = false) {
  text(p, label.toUpperCase(), x, top, 9, bold, dark ? C.cyan : C.indigo, { characterSpacing: 1.4 });
}

function footer(p, dark = false, pageNumber = "") {
  rule(p, 48, H - 56, W - 96, dark ? C.ink2 : C.line);
  text(p, "CAMPAIGN MASTERS UAE", 48, H - 38, 8, bold, dark ? C.slateLight : C.slate, { characterSpacing: 1 });
  text(p, "campaign@instagram-analytics.com", 48, H - 24, 8, regular, dark ? C.slateLight : C.slate);
  if (pageNumber) {
    text(p, pageNumber, W - 48 - widthOf(pageNumber, 8, bold), H - 38, 8, bold, dark ? C.slateLight : C.slate);
  }
  text(p, "www.instagram-analytics.com", W - 48 - widthOf("www.instagram-analytics.com", 8, regular), H - 24, 8, regular, dark ? C.slateLight : C.slate);
}

function drawLogo(p, x, top, size = 42) {
  const y = H - top - size;
  p.drawImage(logoImage, { x, y, width: size, height: size });
  p.drawRectangle({
    x,
    y,
    width: size,
    height: size,
    borderColor: C.indigoSoft,
    borderWidth: 1,
  });
}

/* ------------------------------------------------------------------ */
/* Page 1 - cover                                                      */
/* ------------------------------------------------------------------ */
{
  const p = page(true);
  rect(p, 0, 0, 12, H, C.indigo);
  rect(p, 0, 0, W, 6, C.indigo);

  p.drawCircle({ cx: W - 70, cy: H - 120, size: 150, color: C.ink2 });
  p.drawCircle({ cx: W - 20, cy: H - 250, size: 90, color: C.indigoSoft, opacity: 0.12 });
  p.drawCircle({ cx: 90, cy: 150, size: 120, color: C.cyan, opacity: 0.05 });

  drawLogo(p, 48, 54, 46);
  text(p, "CAMPAIGN MASTERS UAE", 110, 72, 17, bold, C.white, { characterSpacing: 0.6 });
  text(p, "CREATOR PARTNERSHIPS  |  EVENT ACTIVATIONS", 110, 90, 9, regular, C.slateLight, { characterSpacing: 1.1 });
  text(p, "COMPANY PROFILE  /  2026", W - 48 - widthOf("COMPANY PROFILE  /  2026", 9, bold), 74, 9, bold, C.slateLight, { characterSpacing: 1 });

  eyebrow(p, "UAE-based  |  Middle East reach", 48, 205, true);
  text(p, "Turn public signal", 48, 258, 35, bold, C.white);
  text(p, "into partnerships", 48, 300, 35, bold, C.white);
  text(p, "people remember.", 48, 342, 35, bold, C.cyan);

  paragraph(
    p,
    "We connect brands with the right creators, build the partnership mechanics behind the campaign, and stage the live moments that make it land.",
    48,
    400,
    13.5,
    455,
    C.slateLight,
    regular,
    22,
  );

  rect(p, 48, 700, W - 96, 1, C.ink2);
  text(p, "campaign@instagram-analytics.com", 48, 730, 12, bold, C.white);
  text(p, "www.instagram-analytics.com", 48, 750, 11, regular, C.slateLight);
  text(p, "November 2026", W - 48 - widthOf("November 2026", 11, regular), 750, 11, regular, C.slateLight);
}

/* ------------------------------------------------------------------ */
/* Page 2 - point of view                                              */
/* ------------------------------------------------------------------ */
{
  const p = page();
  eyebrow(p, "01 / Point of view", 48, 62);
  text(p, "Start with proof, not a follower count.", 48, 100, 25, bold, C.ink);
  paragraph(
    p,
    "In a crowded creator market, the hardest part is not finding accounts. It is knowing which ones deserve a conversation. We turn real public signals into a shortlist you can defend, then carry that same thinking into the partnership and the event itself.",
    48,
    135,
    11.5,
    W - 96,
    C.slate,
    regular,
    18,
  );

  const beliefs = [
    {
      n: "01",
      title: "Evidence before outreach",
      body: "Review real public profile data, recent post activity and engagement quality before anyone reaches out.",
    },
    {
      n: "02",
      title: "Fit over fame",
      body: "Category, audience size, posting behaviour and authenticity signals matter more than a headline follower number.",
    },
    {
      n: "03",
      title: "One story, every channel",
      body: "The creator you shortlist, the partnership you design and the moment you stage should all say the same thing.",
    },
  ];

  beliefs.forEach((item, i) => {
    const x = 48 + i * 170;
    rect(p, x, 205, 155, 190, C.card, C.line);
    rect(p, x, 205, 155, 4, C.indigo);
    text(p, item.n, x + 16, 235, 11, bold, C.indigo);
    text(p, item.title, x + 16, 267, 12.5, bold, C.ink);
    paragraph(p, item.body, x + 16, 292, 10.5, 123, C.slate, regular, 16);
  });

  roundRect(p, 48, 430, W - 96, 150, C.ink, 14);
  rect(p, 48, 430, 5, 150, C.cyan);
  text(p, "WHAT WE BELIEVE", 72, 465, 9, bold, C.cyan, { characterSpacing: 1.3 });
  text(p, "Public signals do not tell the whole story.", 72, 497, 16, bold, C.white);
  text(p, "They tell you where to look, who to shortlist, and what to ask in the first meeting.", 72, 522, 12, regular, C.slateLight);
  text(p, "Real public data. Clearly labeled estimates. No invented numbers.", 72, 552, 10, regular, C.indigoSoft);

  text(p, "UAE-based. Working across the Middle East.", 48, 625, 11, bold, C.ink);
  paragraph(
    p,
    "Every recommendation is grounded in what is publicly visible and honest about what Instagram does not publish. If a number is not available, it stays a dash.",
    48,
    648,
    11,
    W - 96,
    C.slate,
    regular,
    17,
  );
  footer(p, false, "02");
}

/* ------------------------------------------------------------------ */
/* Page 3 - services                                                   */
/* ------------------------------------------------------------------ */
{
  const p = page();
  eyebrow(p, "02 / What we do", 48, 62);
  text(p, "One partner from shortlist to stage.", 48, 100, 25, bold, C.ink);
  paragraph(
    p,
    "Five connected services, built around the same evidence layer. Use them as one programme or bring us in at the stage you need us.",
    48,
    135,
    11.5,
    W - 96,
    C.slate,
    regular,
    18,
  );

  const services = [
    {
      n: "01",
      title: "Discover and vet creators",
      body: "Find public profiles, compare engagement quality and audience fit, and shortlist the right people before outreach.",
    },
    {
      n: "02",
      title: "Map paid partnerships",
      body: "Understand branded-content history, creator relationships and competitor collaborations across the accounts you follow.",
    },
    {
      n: "03",
      title: "Run affiliate programs",
      body: "Coordinate creator links, promo codes and gifting, then review content performance and campaign summaries in one place.",
    },
    {
      n: "04",
      title: "Manage creator relationships",
      body: "Keep lists, outreach, deliverables and performance history organized from first conversation to long-term partnership.",
    },
    {
      n: "05",
      title: "Stage brand events",
      body: "Plan creator appearances, launches and activations that carry the same story from social feeds into the room.",
    },
  ];

  const positions = [
    [48, 195],
    [312, 195],
    [48, 340],
    [312, 340],
    [48, 485],
  ];

  services.forEach((service, i) => {
    const [x, y] = positions[i];
    rect(p, x, y, 235, 128, C.card, C.line);
    rect(p, x, y, 4, 128, i === 4 ? C.cyan : C.indigo);
    text(p, service.n, x + 18, y + 27, 10, bold, i === 4 ? C.cyan : C.indigo);
    text(p, service.title, x + 18, y + 53, 12.5, bold, C.ink);
    paragraph(p, service.body, x + 18, y + 76, 10, 199, C.slate, regular, 15);
  });

  roundRect(p, 312, 485, 235, 128, C.ink, 12);
  text(p, "THE SHORT VERSION", 330, 515, 9, bold, C.cyan, { characterSpacing: 1.2 });
  text(p, "We make creator decisions", 330, 544, 13, bold, C.white);
  text(p, "easier to justify - and", 330, 564, 13, bold, C.white);
  text(p, "harder to get wrong.", 330, 584, 13, bold, C.cyan);
  text(p, "campaign@instagram-analytics.com", 330, 607, 9, regular, C.slateLight);

  footer(p, false, "03");
}

/* ------------------------------------------------------------------ */
/* Page 4 - evidence engine                                            */
/* ------------------------------------------------------------------ */
{
  const p = page(true);
  eyebrow(p, "03 / The evidence engine", 48, 62, true);
  text(p, "Instagram Analytics is our evidence layer.", 48, 100, 24, bold, C.white);
  paragraph(
    p,
    "A purpose-built workspace that turns a public username into an analysis, a comparison or a shareable report. It keeps the chemistry in the room and the numbers on the page.",
    48,
    136,
    11.5,
    W - 96,
    C.slateLight,
    regular,
    18,
  );

  const steps = [
    ["01", "Username in", "Any public handle. No keys, no credits."],
    ["02", "Public signals", "Profile, verification and up to 12 recent posts."],
    ["03", "Metric engine", "Measured values first, estimates labeled Est."],
    ["04", "Analysis out", "Profile view, four-way compare or PDF report."],
  ];

  steps.forEach((step, i) => {
    const x = 48 + i * 128;
    rect(p, x, 210, 116, 150, C.ink2, C.ink2);
    rect(p, x, 210, 116, 3, i === 3 ? C.cyan : C.indigo);
    text(p, step[0], x + 14, 237, 11, bold, C.cyan);
    text(p, step[1], x + 14, 264, 12, bold, C.white);
    paragraph(p, step[2], x + 14, 287, 9.5, 90, C.slateLight, regular, 14);
  });

  text(p, "Measured", 48, 405, 13, bold, C.white);
  text(p, "Disclosed estimates", 312, 405, 13, bold, C.white);
  rule(p, 48, 415, 235, C.indigo);
  rule(p, 312, 415, 235, C.cyan);
  paragraph(
    p,
    "Engagement rate is calculated from public post interactions. Saves are included only when every sampled post exposes them.",
    48,
    438,
    10.5,
    235,
    C.slateLight,
    regular,
    17,
  );
  paragraph(
    p,
    "Fake followers, authenticity and 12-month growth are modeled from public signals when Instagram does not publish the underlying history. Every view says Est.",
    312,
    438,
    10.5,
    235,
    C.slateLight,
    regular,
    17,
  );

  text(p, "BUILT TO BUILD THE RIGHT POOL", 48, 540, 9, bold, C.cyan, { characterSpacing: 1.2 });
  text(p, "The tool is harnessed to build the creator pool, not just report on it.", 48, 566, 15, bold, C.white);
  paragraph(
    p,
    "From first signal to final result, every step turns public evidence into a connection worth making.",
    48,
    589,
    10.5,
    W - 96,
    C.slateLight,
    regular,
    16,
  );

  const flow = [
    ["01", "Analyze"],
    ["02", "Talk"],
    ["03", "Deal"],
    ["04", "Premium deliverables"],
    ["05", ["Client & influencer", "satisfaction"]],
    ["06", "Brand target achieved"],
  ];

  flow.forEach((step, index) => {
    const row = Math.floor(index / 3);
    const col = index % 3;
    const x = 48 + col * 166;
    const top = 620 + row * 72;
    const accent = index === 5 ? C.cyan : C.indigo;

    roundRect(p, x, top, 150, 60, C.ink2, 9, accent, 1);
    text(p, step[0], x + 12, top + 20, 9, bold, accent);

    if (Array.isArray(step[1])) {
      step[1].forEach((line, lineIndex) => {
        text(p, line, x + 12, top + 38 + lineIndex * 12, 8.6, bold, C.white);
      });
    } else {
      text(p, step[1], x + 12, top + 39, step[1].length > 16 ? 9 : 10.5, bold, C.white);
    }

    if (col < 2) {
      text(p, ">", x + 154, top + 35, 12, bold, C.cyan);
    }
  });
  footer(p, true, "04");
}

/* ------------------------------------------------------------------ */
/* Page 5 - activation playbook                                        */
/* ------------------------------------------------------------------ */
{
  const p = page();
  eyebrow(p, "04 / Event activation", 48, 62);
  text(p, "From feed to floor, without losing the thread.", 48, 100, 24, bold, C.ink);
  paragraph(
    p,
    "An activation only works when the creator, the content and the room are telling the same story. Our process keeps them connected from the first shortlist to the final readout.",
    48,
    136,
    11.5,
    W - 96,
    C.slate,
    regular,
    18,
  );

  const phases = [
    ["01", "Discovery sprint", "Public profile review, category and audience-fit shortlist."],
    ["02", "Partnership design", "Paid-partnership history, affiliate mechanics and clear deliverables."],
    ["03", "Live activation", "Creator appearances, launches and brand-event moments."],
    ["04", "Post-event readout", "Comparison, performance summary and the next shortlist."],
  ];

  rule(p, 70, 215, 1, C.line, 1);
  p.drawLine({ start: { x: 70, y: H - 215 }, end: { x: 70, y: H - 600 }, thickness: 2, color: C.indigo });

  phases.forEach((phase, i) => {
    const y = 220 + i * 95;
    p.drawCircle({ cx: 70, cy: H - y - 10, size: 13, color: i === 2 ? C.cyan : C.indigo });
    centerText(p, phase[0], 70, y - 4, 8, bold, C.white);
    text(p, phase[1], 100, y - 4, 14, bold, C.ink);
    paragraph(p, phase[2], 100, y + 20, 11, 308, C.slate, regular, 17);
  });

  roundRect(p, 430, 215, 117, 350, C.ink, 12);
  text(p, "BUILT FOR", 448, 245, 9, bold, C.cyan, { characterSpacing: 1.2 });
  const builtFor = [
    "Product launches",
    "Brand events",
    "Creator appearances",
    "Regional campaigns",
    "Affiliate programs",
    "Partnership reviews",
  ];
  builtFor.forEach((item, i) => {
    text(p, "+", 448, 280 + i * 36, 13, bold, C.cyan);
    text(p, item, 466, 280 + i * 36, 10.5, regular, C.white);
  });
  text(p, "UAE base.", 448, 520, 10, bold, C.white);
  text(p, "Middle East reach.", 448, 537, 10, bold, C.cyan);

  text(p, "Tell us what you are launching. We will tell you what evidence we need first.", 48, 665, 12, bold, C.ink);
  footer(p, false, "05");
}

/* ------------------------------------------------------------------ */
/* Page 6 - contact                                                    */
/* ------------------------------------------------------------------ */
{
  const p = page(true);
  rect(p, 0, 0, W, 8, C.cyan);
  p.drawCircle({ cx: W - 90, cy: H - 160, size: 180, color: C.ink2 });
  p.drawCircle({ cx: W - 30, cy: H - 360, size: 110, color: C.indigo, opacity: 0.18 });

  drawLogo(p, 48, 54, 44);
  text(p, "CAMPAIGN MASTERS UAE", 106, 72, 16, bold, C.white, { characterSpacing: 0.6 });

  eyebrow(p, "05 / Start a conversation", 48, 190, true);
  text(p, "Your next creator moment", 48, 240, 32, bold, C.white);
  text(p, "starts with one email.", 48, 280, 32, bold, C.cyan);

  paragraph(
    p,
    "Send us the market, category, launch date and the kind of activation you have in mind. We will come back with a practical shortlist and a clear next step.",
    48,
    338,
    13,
    470,
    C.slateLight,
    regular,
    22,
  );

  roundRect(p, 48, 435, W - 96, 128, C.ink2, 14, C.indigoSoft, 1);
  text(p, "EMAIL THE TEAM", 72, 465, 9, bold, C.cyan, { characterSpacing: 1.3 });
  text(p, "campaign@instagram-analytics.com", 72, 500, 20, bold, C.white);
  text(p, "www.instagram-analytics.com", 72, 532, 12, regular, C.slateLight);

  text(p, "USEFUL TO INCLUDE", 48, 600, 9, bold, C.cyan, { characterSpacing: 1.3 });
  const includes = [
    "Target market and audience",
    "Creator category or shortlist",
    "Launch or event date",
    "Paid, affiliate or live-activation goals",
  ];
  includes.forEach((item, i) => {
    text(p, "+", 48, 627 + i * 24, 12, bold, C.cyan);
    text(p, item, 68, 627 + i * 24, 11, regular, C.white);
  });

  footer(p, true, "06");
}

const bytes = await doc.save();
writeFileSync(OUT, bytes);
console.log(`${OUT} - ${(bytes.length / 1024).toFixed(1)} KB - 6 pages`);
