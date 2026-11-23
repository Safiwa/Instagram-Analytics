import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PDFDocument, degrees, rgb, StandardFonts } from "pdf-lib";

const OUT = "Campaign-Masters-UAE-Company-Profile.pdf";
const LOGO = "assets/campaign-masters-logo.png";
const ARABIC_FONT = "assets/NotoNaskhArabic.ttf";

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
  line: rgb(0.87, 0.89, 0.94),
};

function text(p, value, x, top, size, font = undefined, color = C.ink, options = {}) {
  p.drawText(value, {
    x,
    y: H - top,
    size,
    font,
    color,
    ...options,
  });
}

function widthOf(value, size, font = undefined) {
  return font ? font.widthOfTextAtSize(value, size) : (value.length * size * 0.52);
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

function paragraph(p, value, x, top, size, maxWidth, color, font, lineHeight = size * 1.5) {
  const lines = wrap(value, font, size, maxWidth);
  lines.forEach((line, index) => text(p, line, x, top + index * lineHeight, size, font, color));
  return top + lines.length * lineHeight;
}

function eyebrow(p, label, x, top, dark = false) {
  text(p, label.toUpperCase(), x, top, 9, undefined, dark ? C.cyan : C.indigo, { characterSpacing: 1.4 });
}

function rect(p, x, top, w, h, color) {
  p.drawRectangle({ x, y: H - top - h, width: w, height: h, color });
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

const doc = await PDFDocument.create();
doc.setTitle("Campaign Masters UAE - Company Profile");
doc.setAuthor("Campaign Masters UAE");
doc.setSubject("Creator partnerships, brand collaborations and event activations across the Middle East");
doc.setKeywords([
  "creator marketing",
  "UAE agency",
  "event activation",
  "Instagram analytics",
  "Middle East",
  "Arabic",
]);
doc.setCreator("Campaign Masters UAE");

const regular = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);
const logoImage = await doc.embedPng(readFileSync(LOGO));

/* ------------------------------------------------------------------ */
/* Cover page - unchanged                                              */
/* ------------------------------------------------------------------ */
{
  const p = doc.addPage([W, H]);
  p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.ink });

  const tint = C.cyan;
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
      opacity: 0.055,
    });
  });
  nodes.forEach(([x, top], index) => {
    p.drawCircle({
      cx: x,
      cy: H - top,
      size: index % 4 === 0 ? 2.6 : 1.6,
      color: tint,
      opacity: 0.09,
    });
  });

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
/* Bilingual content pages 2-7                                         */
/* ------------------------------------------------------------------ */
const BILINGUAL_PAGES = [
  {
    en: {
      eyebrow: "WHO WE CONNECT",
      title: "Brands, events and the people behind them.",
      heading: "Access to the decision makers.",
      body: "We connect with brands and events across the Middle East, with access to the key decision makers behind them. From hospitality and automotive launches to fashion, F&B and cosmetics, and from key regional occasions to major events, we bring the right people together and turn access into activations that land.",
      sections: [{ kind: "tags", items: ["Hospitality", "Automotive launches", "Fashion", "F&B", "Cosmetics", "Regional occasions & events"] }],
    },
    ar: {
      eyebrow: "من نربط",
      title: "العلامات التجارية والفعاليات وصنّاع القرار.",
      heading: "الوصول إلى صنّاع القرار.",
      body: "نتواصل مع العلامات التجارية والفعاليات في مختلف أنحاء الشرق الأوسط، ولدينا إمكانية الوصول إلى صنّاع القرار الرئيسيين خلفها. من الضيافة وإطلاقات السيارات إلى الأزياء والأغذية والمشروبات ومستحضرات التجميل، ومن المناسبات الإقليمية الرئيسية إلى الفعاليات الكبرى، نجمع الأشخاص المناسبين ونحوّل هذا الوصول إلى تفعيلات تُحقق الأثر.",
      sections: [{ kind: "tags", items: ["الضيافة", "إطلاقات السيارات", "الأزياء", "الأغذية والمشروبات", "مستحضرات التجميل", "المناسبات والفعاليات الإقليمية"] }],
    },
    callout: {
      enLabel: "THE SHORT VERSION",
      en: "Access to decision makers, from first introduction to final activation.",
      arLabel: "الخلاصة",
      ar: "الوصول إلى صنّاع القرار، من أول تعريف إلى التفعيل النهائي.",
    },
  },
  {
    en: {
      eyebrow: "01 / POINT OF VIEW",
      title: "Start with proof, not a follower count.",
      heading: "Evidence before noise.",
      body: "In a crowded creator market, the hardest part is not finding accounts. It is knowing which ones deserve a conversation. We turn real public signals into a shortlist you can defend, then carry that same thinking into the partnership and the event itself.",
      sections: [
        {
          kind: "items",
          items: [
            { n: "01", title: "Evidence before outreach", body: "Review real public profile data, recent post activity and engagement quality before anyone reaches out." },
            { n: "02", title: "Fit over fame", body: "Category, audience size, posting behaviour and authenticity signals matter more than a headline follower number." },
            { n: "03", title: "One story, every channel", body: "The creator you shortlist, the partnership you design and the moment you stage should all say the same thing." },
          ],
        },
        { kind: "note", text: "UAE-based. Working across the Middle East. Every recommendation is grounded in what is publicly visible and honest about what Instagram does not publish. If a number is not available, it stays a dash." },
      ],
    },
    ar: {
      eyebrow: "01 / وجهة نظر",
      title: "ابدأ بالدليل، لا بعدد المتابعين.",
      heading: "الدليل قبل الضجيج.",
      body: "في سوق مزدحم بالمبدعين، أصعب جزء ليس العثور على الحسابات، بل معرفة أيّها يستحق المحادثة. نحوّل الإشارات العامة الحقيقية إلى قائمة مختصرة يمكنك الدفاع عنها، ثم نحمل التفكير نفسه إلى الشراكة والفعالية.",
      sections: [
        {
          kind: "items",
          items: [
            { n: "01", title: "الدليل قبل التواصل", body: "راجع بيانات الملف العام الحقيقية ونشاط المنشورات الأخيرة وجودة التفاعل قبل أي تواصل." },
            { n: "02", title: "الملاءمة قبل الشهرة", body: "الفئة وحجم الجمهور وسلوك النشر وإشارات الأصالة أهم من رقم المتابعين في العنوان." },
            { n: "03", title: "قصة واحدة، كل قناة", body: "المبدع الذي تختاره، والشراكة التي تصممها، واللحظة التي تنظمها يجب أن تقول الشيء نفسه." },
          ],
        },
        { kind: "note", text: "مقرنا في الإمارات، ونعمل في أنحاء الشرق الأوسط. كل توصية تستند إلى ما هو مرئي للعامة، وتكون صريحة بشأن ما لا تنشره إنستغرام. إذا لم يتوفر رقم، يبقى شرطة." },
      ],
    },
    callout: {
      enLabel: "WHAT WE BELIEVE",
      en: "Real public data. Clearly labeled estimates. No invented numbers.",
      arLabel: "ما نؤمن به",
      ar: "بيانات عامة حقيقية. تقديرات موسومة بوضوح. لا أرقام مُختلقة.",
    },
  },
  {
    en: {
      eyebrow: "02 / WHAT WE DO",
      title: "One partner from shortlist to stage.",
      heading: "Five connected services.",
      body: "Five connected services, built around the same evidence layer. Use them as one programme or bring us in at the stage you need us.",
      sections: [
        {
          kind: "items",
          items: [
            { n: "01", title: "Discover and vet creators", body: "Find public profiles, compare engagement quality and audience fit, and shortlist the right people before outreach." },
            { n: "02", title: "Map paid partnerships", body: "Understand branded-content history, creator relationships and competitor collaborations across the accounts you follow." },
            { n: "03", title: "Run affiliate programs", body: "Coordinate creator links, promo codes and gifting, then review content performance and campaign summaries in one place." },
            { n: "04", title: "Manage creator relationships", body: "Keep lists, outreach, deliverables and performance history organized from first conversation to long-term partnership." },
            { n: "05", title: "Stage brand events", body: "Plan creator appearances, launches and activations that carry the same story from social feeds into the room." },
          ],
        },
      ],
    },
    ar: {
      eyebrow: "02 / ما نقوم به",
      title: "شريك واحد من القائمة المختصرة إلى المنصّة.",
      heading: "خمس خدمات مترابطة.",
      body: "خمس خدمات مترابطة، مبنية على طبقة أدلة واحدة. استخدمها كبرنامج متكامل أو استدعنا في المرحلة التي تحتاجنا فيها.",
      sections: [
        {
          kind: "items",
          items: [
            { n: "01", title: "اكتشف المبدعين وافحصهم", body: "ابحث عن الملفات العامة، وقارن جودة التفاعل وملاءمة الجمهور، واختر الأشخاص المناسبين قبل التواصل." },
            { n: "02", title: "ارسم خريطة الشراكات المدفوعة", body: "افهم تاريخ المحتوى ذي العلامات التجارية وعلاقات المبدعين وتعاون المنافسين عبر الحسابات التي تتابعها." },
            { n: "03", title: "أدر برامج التسويق بالعمولة", body: "نسّق روابط المبدعين وأكواد الخصم والهدايا، ثم راجع أداء المحتوى وملخصات الحملات في مكان واحد." },
            { n: "04", title: "أدر علاقات المبدعين", body: "حافظ على القوائم والتواصل والمخرجات وسجل الأداء منظمة من المحادثة الأولى إلى الشراكة طويلة الأمد." },
            { n: "05", title: "نظّم فعاليات العلامات التجارية", body: "خطّط لحضور المبدعين وإطلاقات المنتجات والتفعيلات التي تحمل القصة نفسها من منصات التواصل إلى المكان." },
          ],
        },
      ],
    },
    callout: {
      enLabel: "THE SHORT VERSION",
      en: "We make creator decisions easier to justify - and harder to get wrong.",
      arLabel: "الخلاصة",
      ar: "نجعل قرارات اختيار المبدعين أسهل في التبرير، وأصعب في الخطأ.",
    },
  },
  {
    en: {
      eyebrow: "03 / THE EVIDENCE ENGINE",
      title: "Instagram Analytics is our evidence layer.",
      heading: "From handle to decision.",
      body: "A purpose-built workspace that turns a public username into an analysis, a comparison or a shareable report. It keeps the chemistry in the room and the numbers on the page.",
      sections: [
        {
          kind: "items",
          items: [
            { n: "01", title: "Username in", body: "Any public handle. No keys, no credits." },
            { n: "02", title: "Public signals", body: "Profile, verification and up to 12 recent posts." },
            { n: "03", title: "Metric engine", body: "Measured values first, estimates labeled Est." },
            { n: "04", title: "Analysis out", body: "Profile view, four-way compare or PDF report." },
            { n: "05", title: "Measured", body: "Engagement rate is calculated from public post interactions. Saves are included only when every sampled post exposes them." },
            { n: "06", title: "Disclosed estimates", body: "Fake followers, authenticity and 12-month growth are modeled from public signals when Instagram does not publish the underlying history. Every view says Est." },
          ],
        },
        { kind: "tags", items: ["Analyze", "Talk", "Deal", "Premium deliverables", "Client & influencer satisfaction", "Brand target achieved"] },
      ],
    },
    ar: {
      eyebrow: "03 / محرك الأدلة",
      title: "إنستغرام أناليتكس هو طبقة الأدلة لدينا.",
      heading: "من اسم المستخدم إلى القرار.",
      body: "مساحة عمل مصممة خصيصًا تحوّل اسم مستخدم عام إلى تحليل أو مقارنة أو تقرير قابل للمشاركة. تُبقي الكيمياء في الغرفة والأرقام على الورقة.",
      sections: [
        {
          kind: "items",
          items: [
            { n: "01", title: "اسم المستخدم", body: "أي حساب عام. بلا مفاتيح أو رصيد." },
            { n: "02", title: "الإشارات العامة", body: "الملف والتوثيق وحتى 12 منشورًا أخيرًا." },
            { n: "03", title: "محرك القياس", body: "القيم المقاسة أولًا، والتقديرات موسومة بـ«تقديري»." },
            { n: "04", title: "مخرجات التحليل", body: "عرض الملف أو مقارنة رباعية أو تقرير PDF." },
            { n: "05", title: "مقاس", body: "يُحسب معدل التفاعل من تفاعلات المنشورات العامة. تُدرج الحفظات فقط عندما تكشفها كل المنشورات المُعايَنة." },
            { n: "06", title: "تقديرات مُفصح عنها", body: "المتابعون المزيفون والأصالة ونمو 12 شهرًا تُ نمذَج من الإشارات العامة عندما لا تنشر إنستغرام السجل الأساسي. كل عرض يقول «تقديري»." },
          ],
        },
        { kind: "tags", items: ["تحليل", "تواصل", "اتفاق", "مخرجات مميزة", "رضا العميل والمؤثر", "تحقيق هدف العلامة"] },
      ],
    },
    callout: {
      enLabel: "BUILT TO BUILD THE RIGHT POOL",
      en: "The tool is harnessed to build the creator pool, not just report on it.",
      arLabel: "مُصمَّم لبناء القائمة الصحيحة",
      ar: "الأداة مُسخَّرة لبناء قائمة المبدعين، لا للتقرير فقط.",
    },
  },
  {
    en: {
      eyebrow: "04 / EVENT ACTIVATION",
      title: "From feed to floor, without losing the thread.",
      heading: "One connected process.",
      body: "An activation only works when the creator, the content and the room are telling the same story. Our process keeps them connected from the first shortlist to the final readout.",
      sections: [
        {
          kind: "items",
          items: [
            { n: "01", title: "Discovery sprint", body: "Public profile review, category and audience-fit shortlist." },
            { n: "02", title: "Partnership design", body: "Paid-partnership history, affiliate mechanics and clear deliverables." },
            { n: "03", title: "Live activation", body: "Creator appearances, launches and brand-event moments." },
            { n: "04", title: "Post-event readout", body: "Comparison, performance summary and the next shortlist." },
          ],
        },
        { kind: "tags", items: ["Product launches", "Brand events", "Creator appearances", "Regional campaigns", "Affiliate programs", "Partnership reviews"] },
        { kind: "note", text: "UAE base. Middle East reach." },
      ],
    },
    ar: {
      eyebrow: "04 / تفعيل الفعاليات",
      title: "من الخلاصة إلى أرض الفعالية، دون أن نفقد الخيط.",
      heading: "عملية واحدة متصلة.",
      body: "لا تنجح التفعيلات إلا عندما يحكي المبدع والمحتوى والمكان القصة نفسها. تحرص عمليتنا على إبقائها متصلة من القائمة الأولى إلى القراءة النهائية.",
      sections: [
        {
          kind: "items",
          items: [
            { n: "01", title: "مرحلة الاكتشاف", body: "مراجعة الملف العام، وقائمة مختصرة حسب الفئة وملاءمة الجمهور." },
            { n: "02", title: "تصميم الشراكة", body: "تاريخ الشراكات المدفوعة وآليات العمولة والمخرجات الواضحة." },
            { n: "03", title: "التفعيل المباشر", body: "حضور المبدعين والإطلاقات ولحظات فعاليات العلامة." },
            { n: "04", title: "قراءة ما بعد الفعالية", body: "مقارنة وملخص أداء والقائمة التالية." },
          ],
        },
        { kind: "tags", items: ["إطلاقات المنتجات", "فعاليات العلامات", "حضور المبدعين", "حملات إقليمية", "برامج العمولة", "مراجعات الشراكات"] },
        { kind: "note", text: "مقرنا في الإمارات. وصولنا في الشرق الأوسط." },
      ],
    },
    callout: {
      enLabel: "START WITH THE BRIEF",
      en: "Tell us what you are launching. We will tell you what evidence we need first.",
      arLabel: "ابدأ بالمطلوب",
      ar: "أخبرنا بما تطلقه، وسنخبرك بالأدلة التي نحتاجها أولًا.",
    },
  },
  {
    en: {
      eyebrow: "05 / START A CONVERSATION",
      title: "Your next creator moment starts with one email.",
      heading: "Send us the brief.",
      body: "Send us the market, category, launch date and the kind of activation you have in mind. We will come back with a practical shortlist and a clear next step.",
      sections: [
        {
          kind: "items",
          items: [
            { n: "+", title: "Target market and audience", body: "" },
            { n: "+", title: "Creator category or shortlist", body: "" },
            { n: "+", title: "Launch or event date", body: "" },
            { n: "+", title: "Paid, affiliate or live-activation goals", body: "" },
          ],
        },
      ],
    },
    ar: {
      eyebrow: "05 / لنبدأ محادثة",
      title: "لحظتك القادمة مع مبدع تبدأ برسالة واحدة.",
      heading: "أرسل لنا المطلوب.",
      body: "أرسل لنا السوق والفئة وموعد الإطلاق ونوع التفعيل الذي تفكر فيه. سنعود إليك بقائمة عملية وخطوة تالية واضحة.",
      sections: [
        {
          kind: "items",
          items: [
            { n: "+", title: "السوق والجمهور المستهدف", body: "" },
            { n: "+", title: "فئة المبدعين أو القائمة المختصرة", body: "" },
            { n: "+", title: "موعد الإطلاق أو الفعالية", body: "" },
            { n: "+", title: "أهداف الشراكة المدفوعة أو العمولة أو التفعيل المباشر", body: "" },
          ],
        },
      ],
    },
    callout: {
      enLabel: "EMAIL THE TEAM",
      en: "campaign@instagram-analytics.com",
      arLabel: "راسل الفريق",
      ar: "campaign@instagram-analytics.com",
    },
  },
];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderSection(section) {
  if (section.kind === "tags") {
    return `<div class="tags">${section.items.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("")}</div>`;
  }
  if (section.kind === "note") {
    return `<div class="note">${escapeHtml(section.text)}</div>`;
  }
  return `<div class="blocks">${section.items.map((item) => `
    <div class="block">
      <div class="block-n">${escapeHtml(item.n)}</div>
      <div class="block-title">${escapeHtml(item.title)}</div>
      ${item.body ? `<div class="block-body">${escapeHtml(item.body)}</div>` : ""}
    </div>`).join("")}</div>`;
}

function renderColumn(column, arabic) {
  return `<section class="card${arabic ? " arabic" : ""}"${arabic ? ' dir="rtl"' : ""}>
    <h2>${escapeHtml(column.heading)}</h2>
    <p>${escapeHtml(column.body)}</p>
    ${column.sections.map(renderSection).join("")}
  </section>`;
}

function renderBilingualPage(page, index) {
  const pageNumber = String(index + 2).padStart(2, "0");
  return `<div class="page">
    <div class="topbar"></div>
    <div class="page-no">${pageNumber}</div>
    <div class="header">
      <div class="header-side">
        <div class="eyebrow">${escapeHtml(page.en.eyebrow)}</div>
        <h1>${escapeHtml(page.en.title)}</h1>
      </div>
      <div class="header-side arabic">
        <div class="eyebrow arabic-eyebrow">${escapeHtml(page.ar.eyebrow)}</div>
        <h1 class="arabic-title">${escapeHtml(page.ar.title)}</h1>
      </div>
    </div>
    <div class="columns">
      ${renderColumn(page.en, false)}
      ${renderColumn(page.ar, true)}
    </div>
    <div class="callout">
      <div class="label">${escapeHtml(page.callout.enLabel)}</div>
      <div class="copy">${escapeHtml(page.callout.en)}</div>
      <div class="divider"></div>
      <div class="label arabic-label">${escapeHtml(page.callout.arLabel)}</div>
      <div class="copy arabic-copy">${escapeHtml(page.callout.ar)}</div>
    </div>
    <div class="footer">
      <div><strong>CAMPAIGN MASTERS UAE</strong> &nbsp;|&nbsp; campaign@instagram-analytics.com</div>
      <div>www.instagram-analytics.com</div>
    </div>
  </div>`;
}

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean);
  const browser = candidates.find((candidate) => existsSync(candidate));
  if (!browser) {
    throw new Error("Chrome or Edge is required to render the bilingual PDF pages.");
  }
  return browser;
}

async function renderBilingualPages() {
  const fontUrl = pathToFileURL(resolve(ARABIC_FONT)).href;
  const pagesHtml = BILINGUAL_PAGES.map(renderBilingualPage).join("");
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Campaign Masters UAE - Bilingual Company Profile</title>
<style>
  @font-face {
    font-family: "NotoNaskh";
    src: url("${fontUrl}") format("truetype");
    font-weight: 400;
  }
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; width: 210mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0d1426; background: #f7f8ff; }
  .page { position: relative; width: 210mm; height: 297mm; overflow: hidden; break-after: page; }
  .page:last-child { break-after: auto; }
  .page::before {
    content: ""; position: absolute; inset: 0; pointer-events: none;
    background:
      radial-gradient(circle at 8% 12%, rgba(89,82,242,.09) 0 1.4mm, transparent 1.6mm),
      radial-gradient(circle at 91% 22%, rgba(56,211,232,.09) 0 1.8mm, transparent 2mm),
      radial-gradient(circle at 18% 86%, rgba(89,82,242,.07) 0 1.5mm, transparent 1.7mm),
      radial-gradient(circle at 82% 72%, rgba(56,211,232,.08) 0 1.6mm, transparent 1.8mm);
  }
  .topbar { position: absolute; left: 0; top: 0; width: 100%; height: 2mm; background: #5952f2; }
  .page-no { position: absolute; right: 13mm; top: 7mm; font-size: 2.4mm; font-weight: 800; color: #7a879c; letter-spacing: .2mm; }
  .header { position: absolute; left: 13mm; right: 13mm; top: 15mm; height: 36mm; display: grid; grid-template-columns: 1fr 1fr; gap: 7mm; overflow: hidden; }
  .header-side.arabic { direction: rtl; text-align: right; font-family: "NotoNaskh", serif; }
  .eyebrow { font-size: calc(2.45mm * var(--fit, 1)); font-weight: 800; letter-spacing: .35mm; color: #5952f2; text-transform: uppercase; }
  .arabic-eyebrow { font-family: "NotoNaskh", serif; font-size: calc(3.1mm * var(--fit, 1)); letter-spacing: 0; color: #0aa6bd; text-transform: none; }
  h1 { margin: 3.5mm 0 0; font-size: calc(7.1mm * var(--fit, 1)); line-height: 1.12; letter-spacing: -.2mm; color: #0d1426; }
  .arabic-title { font-family: "NotoNaskh", serif; font-size: calc(7.6mm * var(--fit, 1)); line-height: 1.5; letter-spacing: 0; direction: rtl; text-align: right; }
  .columns { position: absolute; left: 13mm; right: 13mm; top: 58mm; bottom: 45mm; display: grid; grid-template-columns: 1fr 1fr; gap: 7mm; }
  .card { position: relative; overflow: hidden; padding: 6.5mm 6mm 6mm; background: #fff; border: .3mm solid #dfe3ec; border-radius: 4mm; box-shadow: 0 2mm 7mm rgba(13,20,38,.06); }
  .card::before { content: ""; position: absolute; left: 0; top: 0; width: 100%; height: 1.2mm; background: #5952f2; }
  .card.arabic::before { background: #38d3e8; }
  .card h2 { margin: 0 0 3.5mm; font-size: calc(4.8mm * var(--fit, 1)); line-height: 1.2; color: #0d1426; }
  .card.arabic h2 { font-family: "NotoNaskh", serif; font-size: calc(5.4mm * var(--fit, 1)); line-height: 1.5; direction: rtl; text-align: right; }
  .card p { margin: 0; font-size: calc(3.15mm * var(--fit, 1)); line-height: 1.6; color: #47536a; }
  .card.arabic p { font-family: "NotoNaskh", serif; font-size: calc(3.6mm * var(--fit, 1)); line-height: 1.95; direction: rtl; text-align: right; color: #47536a; }
  .blocks { margin-top: 4mm; display: grid; gap: 2.6mm; }
  .block { padding: 3mm 3.4mm; border: .25mm solid #e5e8f1; border-radius: 2.4mm; background: #fafbff; }
  .block-n { font-size: calc(2.35mm * var(--fit, 1)); font-weight: 800; letter-spacing: .2mm; color: #5952f2; }
  .card.arabic .block-n { font-family: "NotoNaskh", serif; font-size: calc(2.9mm * var(--fit, 1)); letter-spacing: 0; color: #0aa6bd; }
  .block-title { margin-top: 1.2mm; font-size: calc(3.3mm * var(--fit, 1)); font-weight: 800; line-height: 1.25; color: #0d1426; }
  .card.arabic .block-title { font-family: "NotoNaskh", serif; font-size: calc(3.8mm * var(--fit, 1)); line-height: 1.6; direction: rtl; text-align: right; }
  .block-body { margin-top: 1.3mm; font-size: calc(2.8mm * var(--fit, 1)); line-height: 1.5; color: #5b667a; }
  .card.arabic .block-body { font-family: "NotoNaskh", serif; font-size: calc(3.3mm * var(--fit, 1)); line-height: 1.85; direction: rtl; text-align: right; color: #5b667a; }
  .tags { display: flex; flex-wrap: wrap; gap: 2mm; margin-top: 5mm; }
  .tag { padding: 1.6mm 2.8mm; border: .25mm solid #dfe3ec; border-radius: 10mm; background: #fafbff; font-size: calc(2.5mm * var(--fit, 1)); color: #2c3850; }
  .card.arabic .tag { font-family: "NotoNaskh", serif; font-size: calc(3mm * var(--fit, 1)); direction: rtl; text-align: right; }
  .note { margin-top: 4mm; padding: 2.8mm 3.2mm; border-left: .8mm solid #38d3e8; background: #f5fbff; font-size: calc(2.8mm * var(--fit, 1)); line-height: 1.55; color: #47536a; }
  .card.arabic .note { font-family: "NotoNaskh", serif; font-size: calc(3.3mm * var(--fit, 1)); line-height: 1.85; direction: rtl; text-align: right; border-left: 0; border-right: .8mm solid #38d3e8; }
  .callout { position: absolute; left: 13mm; right: 13mm; bottom: 24mm; height: 18mm; display: flex; align-items: center; padding: 0 6mm; border-radius: 3mm; background: #0d1426; color: #fff; overflow: hidden; }
  .callout .label { margin-right: 4.5mm; font-size: calc(2.05mm * var(--fit, 1)); font-weight: 800; letter-spacing: .25mm; color: #5ce1f0; white-space: nowrap; }
  .callout .copy { font-size: calc(2.95mm * var(--fit, 1)); line-height: 1.45; }
  .callout .divider { width: .3mm; height: 10mm; margin: 0 4.5mm; background: #2b3650; flex: none; }
  .callout .arabic-label { font-family: "NotoNaskh", serif; font-size: calc(2.8mm * var(--fit, 1)); letter-spacing: 0; white-space: nowrap; }
  .callout .arabic-copy { font-family: "NotoNaskh", serif; font-size: calc(3.35mm * var(--fit, 1)); line-height: 1.75; direction: rtl; text-align: right; }
  .footer { position: absolute; left: 13mm; right: 13mm; bottom: 9mm; display: flex; justify-content: space-between; padding-top: 3mm; border-top: .25mm solid #dfe3ec; font-size: 2.15mm; color: #7a879c; }
  .footer strong { color: #2c3850; letter-spacing: .25mm; }
  @media print { .page { break-after: page; } .page:last-child { break-after: auto; } }
</style>
</head>
<body>
${pagesHtml}
<script>
  window.addEventListener("load", async () => {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
    const fit = (el, min) => {
      el.style.setProperty("--fit", "1");
      const available = el.clientHeight;
      let scale = 1;
      while (el.scrollHeight > available + 1 && scale > min) {
        scale = Math.max(min, scale - 0.02);
        el.style.setProperty("--fit", scale.toFixed(2));
        void el.offsetHeight;
      }
    };
    document.querySelectorAll(".header, .card, .callout").forEach((el) => {
      fit(el, el.classList.contains("header") ? 0.78 : 0.68);
    });
    document.body.dataset.fitted = "true";
  });
</script>
</body>
</html>`;

  const workdir = mkdtempSync(join(tmpdir(), "campaign-masters-bilingual-"));
  const htmlPath = join(workdir, "bilingual.html");
  const pdfPath = join(workdir, "bilingual.pdf");
  writeFileSync(htmlPath, html, "utf8");
  if (process.env.KEEP_BILINGUAL_HTML) {
    writeFileSync("tmp-bilingual.html", html, "utf8");
  }

  try {
    execFileSync(
      findBrowser(),
      [
        "--headless=new",
        "--disable-gpu",
        "--disable-extensions",
        "--no-sandbox",
        "--allow-file-access-from-files",
        "--no-pdf-header-footer",
        "--run-all-compositor-stages-before-draw",
        "--virtual-time-budget=6000",
        `--user-data-dir=${join(workdir, "chrome")}`,
        `--print-to-pdf=${pdfPath}`,
        pathToFileURL(htmlPath).href,
      ],
      { stdio: "pipe", maxBuffer: 20 * 1024 * 1024 },
    );
    return await PDFDocument.load(readFileSync(pdfPath));
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
}

const bilingual = await renderBilingualPages();
const bilingualPages = await doc.copyPages(bilingual, [...bilingual.getPageIndices()]);
bilingualPages.forEach((page) => doc.addPage(page));

const bytes = await doc.save();
writeFileSync(OUT, bytes);
console.log(`${OUT} - ${(bytes.length / 1024).toFixed(1)} KB - ${doc.getPageCount()} pages`);
