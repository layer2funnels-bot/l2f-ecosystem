// The block library as data: every item the sidebar, Quick Add and search offer. ONE list, the approved V2 library:
// 170 blocks in 11 categories (reference/ project/block-inventory.json, owner decision: 170 blocks + 6 widgets).
// Flow blocks map 1:1 to a block type (lib/catalog.ts: behaviour and maths); Notes & layout items are presets of the
// annotation types. Visual treatment lives in lib/block-visuals.ts and the owner artwork in lib/block-art.ts.
// Block types that are not in the approved library (earlier V1 types) stay fully supported on saved maps, in templates
// and in "Change type"; they are just not offered as new library items.
import { BLOCK_TYPES, isBlockType, LIB_GROUPS, type BlockTypeKey, type LibGroup, type NodeParams } from "./catalog";
import type { IconName } from "./icons";

/** What a library item adds: a block type plus optional preset params, name and size. */
export interface LibPayload {
  type: string;
  p?: NodeParams;
  name?: string;
  w?: number;
  h?: number;
}
export interface LibItem {
  key: string;
  label: string;
  icon: IconName;
  group: LibGroup;
  kw: string;
  payload: LibPayload;
}

type Raw = Omit<LibItem, "icon" | "kw"> & { icon?: IconName; kw?: string };

const RAW: Raw[] = [
  { key: "fbads", label: "Facebook Ads", group: "traffic", payload: { type: "fbads" } },
  { key: "igads", label: "Instagram Ads", group: "traffic", payload: { type: "igads" } },
  { key: "gads", label: "Google Ads", group: "traffic", payload: { type: "gads" } },
  { key: "ytads", label: "YouTube Ads", group: "traffic", payload: { type: "ytads" } },
  { key: "ttads", label: "TikTok Ads", group: "traffic", payload: { type: "ttads" } },
  { key: "liads", label: "LinkedIn Ads", group: "traffic", payload: { type: "liads" } },
  { key: "xads", label: "X (Twitter) Ads", group: "traffic", payload: { type: "xads" } },
  { key: "pinads", label: "Pinterest Ads", group: "traffic", payload: { type: "pinads" } },
  { key: "redditads", label: "Reddit Ads", group: "traffic", payload: { type: "redditads" } },
  { key: "bingads", label: "Bing Ads", group: "traffic", payload: { type: "bingads" } },
  { key: "snapads", label: "Snapchat Ads", group: "traffic", payload: { type: "snapads" } },
  { key: "quoraads", label: "Quora Ads", group: "traffic", payload: { type: "quoraads" } },
  { key: "gsearch", label: "Google", group: "traffic", payload: { type: "gsearch" } },
  { key: "bingsearch", label: "Bing", group: "traffic", payload: { type: "bingsearch" } },
  { key: "ytorg", label: "YouTube", group: "traffic", payload: { type: "ytorg" } },
  { key: "ddg", label: "DuckDuckGo", group: "traffic", payload: { type: "ddg" } },
  { key: "seo", label: "All search", group: "traffic", payload: { type: "seo" } },
  { key: "fborg", label: "Facebook", group: "traffic", payload: { type: "fborg" } },
  { key: "igorg", label: "Instagram", group: "traffic", payload: { type: "igorg" } },
  { key: "liorg", label: "LinkedIn", group: "traffic", payload: { type: "liorg" } },
  { key: "ttorg", label: "TikTok", group: "traffic", payload: { type: "ttorg" } },
  { key: "xorg", label: "X (Twitter)", group: "traffic", payload: { type: "xorg" } },
  { key: "pinorg", label: "Pinterest", group: "traffic", payload: { type: "pinorg" } },
  { key: "redditorg", label: "Reddit", group: "traffic", payload: { type: "redditorg" } },
  { key: "threads", label: "Threads", group: "traffic", payload: { type: "threads" } },
  { key: "email", label: "Email", group: "traffic", payload: { type: "email" } },
  { key: "direct", label: "Direct", group: "traffic", payload: { type: "direct" } },
  { key: "affiliate", label: "Affiliates", group: "traffic", payload: { type: "affiliate" } },
  { key: "referral", label: "Referral", group: "traffic", payload: { type: "referral" } },
  { key: "poster", label: "QR code", group: "traffic", payload: { type: "poster" } },
  { key: "podcast", label: "Podcast", group: "traffic", payload: { type: "podcast" } },
  { key: "webtraffic", label: "Webinar traffic", group: "traffic", payload: { type: "webtraffic" } },
  { key: "printad", label: "Print ad", group: "traffic", payload: { type: "printad" } },
  { key: "tvad", label: "TV ad", group: "traffic", payload: { type: "tvad" } },
  { key: "radio", label: "Radio", group: "traffic", payload: { type: "radio" } },
  { key: "billboard", label: "Billboard", group: "traffic", payload: { type: "billboard" } },
  { key: "dmail", label: "Direct mail", group: "traffic", payload: { type: "dmail" } },
  { key: "event", label: "Event / conference", group: "traffic", payload: { type: "event" } },
  { key: "flyer", label: "Flyer", group: "traffic", payload: { type: "flyer" } },
  { key: "optin", label: "Opt-in page", group: "page", payload: { type: "optin" } },
  { key: "squeeze", label: "Squeeze page", group: "page", payload: { type: "squeeze" } },
  { key: "landing", label: "Landing page", group: "page", payload: { type: "landing" } },
  { key: "sales", label: "Sales page", group: "page", payload: { type: "sales" } },
  { key: "longsales", label: "Long-form sales page", group: "page", payload: { type: "longsales" } },
  { key: "vsl", label: "VSL page", group: "page", payload: { type: "vsl" } },
  { key: "webreg", label: "Webinar registration", group: "page", payload: { type: "webreg" } },
  { key: "webinar", label: "Webinar live", group: "page", payload: { type: "webinar" } },
  { key: "replay", label: "Webinar replay", group: "page", payload: { type: "replay" } },
  { key: "quizp", label: "Quiz page", group: "page", payload: { type: "quizp" } },
  { key: "survey", label: "Survey page", group: "page", payload: { type: "survey" } },
  { key: "apply", label: "Application page", group: "page", payload: { type: "apply" } },
  { key: "booking", label: "Booking / calendar", group: "page", payload: { type: "booking" } },
  { key: "thanks", label: "Thank-you page", group: "page", payload: { type: "thanks" } },
  { key: "delivery", label: "Download / delivery", group: "page", payload: { type: "delivery" } },
  { key: "blog", label: "Blog post", group: "page", payload: { type: "blog" } },
  { key: "members", label: "Members area", group: "page", payload: { type: "members" } },
  { key: "homeabout", label: "Home / about", group: "page", payload: { type: "homeabout" } },
  { key: "popup", label: "Popup", group: "page", payload: { type: "popup" } },
  { key: "checkout", label: "Checkout / order form", group: "offer", payload: { type: "checkout" } },
  { key: "onestep", label: "One-step order", group: "offer", payload: { type: "onestep" } },
  { key: "twostep", label: "Two-step order", group: "offer", payload: { type: "twostep" } },
  { key: "bump", label: "Order bump", group: "offer", payload: { type: "bump" } },
  { key: "upsell", label: "Upsell (OTO)", group: "offer", payload: { type: "upsell" } },
  { key: "downsell", label: "Downsell", group: "offer", payload: { type: "downsell" } },
  { key: "sub", label: "Subscription", group: "offer", payload: { type: "sub" } },
  { key: "membership", label: "Membership", group: "offer", payload: { type: "membership" } },
  { key: "plan", label: "Payment plan", group: "offer", payload: { type: "plan" } },
  { key: "trial", label: "Free trial", group: "offer", payload: { type: "trial" } },
  { key: "cartoffer", label: "Cart", group: "offer", payload: { type: "cartoffer" } },
  { key: "product", label: "Product", group: "offer", payload: { type: "product" } },
  { key: "bundle", label: "Bundle", group: "offer", payload: { type: "bundle" } },
  { key: "coupon", label: "Coupon / discount", group: "offer", payload: { type: "coupon" } },
  { key: "purchaseact", label: "Purchase", group: "action", payload: { type: "purchaseact" } },
  { key: "addcart", label: "Add to cart", group: "action", payload: { type: "addcart" } },
  { key: "formsub", label: "Form submit", group: "action", payload: { type: "formsub" } },
  { key: "btnclick", label: "Button click", group: "action", payload: { type: "btnclick" } },
  { key: "clickact", label: "Link click", group: "action", payload: { type: "clickact" } },
  { key: "watch", label: "Watch video", group: "action", payload: { type: "watch" } },
  { key: "scroll", label: "Scroll depth", group: "action", payload: { type: "scroll" } },
  { key: "pageview", label: "Page view", group: "action", payload: { type: "pageview" } },
  { key: "optinact", label: "Opt-in event", group: "action", payload: { type: "optinact" } },
  { key: "bookingmade", label: "Booking made", group: "action", payload: { type: "bookingmade" } },
  { key: "appsubmit", label: "Application submitted", group: "action", payload: { type: "appsubmit" } },
  { key: "quizdone", label: "Quiz completed", group: "action", payload: { type: "quizdone" } },
  { key: "surveydone", label: "Survey completed", group: "action", payload: { type: "surveydone" } },
  { key: "won", label: "Deal won", group: "action", payload: { type: "won" } },
  { key: "lost", label: "Deal lost", group: "action", payload: { type: "lost" } },
  { key: "refundact", label: "Refund", group: "action", payload: { type: "refundact" } },
  { key: "tagact", label: "Add tag", group: "action", payload: { type: "tagact" } },
  { key: "addlist", label: "Add to list", group: "action", payload: { type: "addlist" } },
  { key: "customevent", label: "Custom event", group: "action", payload: { type: "customevent" } },
  { key: "emailone", label: "Email", group: "comms", payload: { type: "emailone" } },
  { key: "sms", label: "SMS", group: "comms", payload: { type: "sms" } },
  { key: "follow", label: "WhatsApp", group: "comms", payload: { type: "follow" } },
  { key: "phone", label: "Phone call", group: "comms", payload: { type: "phone" } },
  { key: "voicemail", label: "Voicemail", group: "comms", payload: { type: "voicemail" } },
  { key: "notify", label: "Push notification", group: "comms", payload: { type: "notify" } },
  { key: "messenger", label: "Messenger", group: "comms", payload: { type: "messenger" } },
  { key: "telegram", label: "Telegram", group: "comms", payload: { type: "telegram" } },
  { key: "slackmsg", label: "Slack message", group: "comms", payload: { type: "slackmsg" } },
  { key: "inapp", label: "In-app message", group: "comms", payload: { type: "inapp" } },
  { key: "chatbot", label: "Chatbot", group: "comms", payload: { type: "chatbot" } },
  { key: "wait", label: "Wait / delay", group: "comms", payload: { type: "wait" } },
  { key: "hubspot", label: "HubSpot", group: "sales", payload: { type: "hubspot" } },
  { key: "salesforce", label: "Salesforce", group: "sales", payload: { type: "salesforce" } },
  { key: "mailchimp", label: "Mailchimp", group: "sales", payload: { type: "mailchimp" } },
  { key: "activecampaign", label: "ActiveCampaign", group: "sales", payload: { type: "activecampaign" } },
  { key: "keap", label: "Keap", group: "sales", payload: { type: "keap" } },
  { key: "pipedrive", label: "Pipedrive", group: "sales", payload: { type: "pipedrive" } },
  { key: "ontraport", label: "Ontraport", group: "sales", payload: { type: "ontraport" } },
  { key: "ghl", label: "GoHighLevel", group: "sales", payload: { type: "ghl" } },
  { key: "intercom", label: "Intercom", group: "sales", payload: { type: "intercom" } },
  { key: "drip", label: "Drip", group: "sales", payload: { type: "drip" } },
  { key: "convertkit", label: "ConvertKit", group: "sales", payload: { type: "convertkit" } },
  { key: "klaviyo", label: "Klaviyo", group: "sales", payload: { type: "klaviyo" } },
  { key: "zoho", label: "Zoho", group: "sales", payload: { type: "zoho" } },
  { key: "constantcontact", label: "Constant Contact", group: "sales", payload: { type: "constantcontact" } },
  { key: "marketo", label: "Marketo", group: "sales", payload: { type: "marketo" } },
  { key: "zapier", label: "Zapier", group: "sales", payload: { type: "zapier" } },
  { key: "webhook", label: "Webhook", group: "sales", payload: { type: "webhook" } },
  { key: "cond", label: "Condition", group: "logic", payload: { type: "cond" } },
  { key: "split", label: "A/B split", group: "logic", payload: { type: "split" } },
  { key: "multivar", label: "Multivariate split", group: "logic", payload: { type: "multivar" } },
  { key: "randsplit", label: "Random split", group: "logic", payload: { type: "randsplit" } },
  { key: "trafficsplit", label: "Traffic split", group: "logic", payload: { type: "trafficsplit" } },
  { key: "merge", label: "Merge", group: "logic", payload: { type: "merge" } },
  { key: "filter", label: "Filter", group: "logic", payload: { type: "filter" } },
  { key: "delaygate", label: "Delay gate", group: "logic", payload: { type: "delaygate" } },
  { key: "revgoal", label: "Revenue goal", group: "logic", payload: { type: "revgoal" } },
  { key: "profitgoal", label: "Profit goal", group: "logic", payload: { type: "profitgoal" } },
  { key: "leadsgoal", label: "Leads goal", group: "logic", payload: { type: "leadsgoal" } },
  { key: "custgoal", label: "Customers goal", group: "logic", payload: { type: "custgoal" } },
  { key: "convgoal", label: "Conversion-rate goal", group: "logic", payload: { type: "convgoal" } },
  { key: "goal", label: "Step-completion goal", group: "logic", payload: { type: "goal" } },
  { key: "exit", label: "End / exit", group: "logic", payload: { type: "exit" } },
  { key: "note", label: "Sticky note", icon: "note", group: "annot", kw: "comment memo", payload: { type: "note" } },
  { key: "text", label: "Text", icon: "text", group: "annot", kw: "canvas text paragraph label body", payload: { type: "label", p: { text: "Text", size: 15 } } },
  { key: "label", label: "Heading", icon: "text", group: "annot", kw: "title stage name subheading", payload: { type: "label" } },
  { key: "frame", label: "Frame / stage", icon: "frame", group: "annot", kw: "container group section stage frame", payload: { type: "frame" } },
  { key: "rect", label: "Rectangle", icon: "frame", group: "annot", kw: "box square shape rounded", payload: { type: "shape", p: { shape: "rect" } } },
  { key: "ellipse", label: "Ellipse", icon: "circle", group: "annot", kw: "oval circle shape", payload: { type: "shape", p: { shape: "ellipse" } } },
  { key: "arrow", label: "Line / arrow", icon: "arrow", group: "annot", kw: "pointer direction connector", payload: { type: "shape", p: { shape: "arrow", dir: "h" }, w: 220, h: 24 } },
  { key: "image", label: "Image", icon: "image", group: "annot", kw: "picture logo upload screenshot", payload: { type: "image" } },
  { key: "video", label: "Video embed", icon: "play", group: "annot", kw: "youtube vimeo loom wistia embed", payload: { type: "link", name: "Video", p: { url: "", title: "Video" } } },
  { key: "link", label: "Link card", icon: "link", group: "annot", kw: "url preview embed", payload: { type: "link" } },
  { key: "checklist", label: "Checklist", icon: "task", group: "annot", kw: "to-do tasks", payload: { type: "checklist" } },
  { key: "goalpill", label: "Goal pill", icon: "goal", group: "annot", kw: "target label badge", payload: { type: "shape", name: "Goal", p: { shape: "rounded", text: "Goal: 100 customers / mo" }, w: 240, h: 44 } },
  { key: "divider", label: "Divider", icon: "line", group: "annot", kw: "separator rule line", payload: { type: "shape", p: { shape: "line", dir: "h" }, w: 320, h: 16 } },
  { key: "emoji", label: "Emoji / icon", icon: "star", group: "annot", kw: "emoji symbol icon sticker", payload: { type: "label", p: { text: "🎯", size: 40 } } },
  { key: "fbgroup", label: "Facebook Group", group: "community", payload: { type: "fbgroup" } },
  { key: "wagroup", label: "WhatsApp Group", group: "community", payload: { type: "wagroup" } },
  { key: "tggroup", label: "Telegram Group", group: "community", payload: { type: "tggroup" } },
  { key: "skool", label: "Skool", group: "community", payload: { type: "skool" } },
  { key: "coursesgg", label: "Courses.gg", group: "community", payload: { type: "coursesgg" } },
  { key: "kajabi", label: "Kajabi", group: "community", payload: { type: "kajabi" } },
  { key: "thinkific", label: "Thinkific", group: "community", payload: { type: "thinkific" } },
  { key: "teachable", label: "Teachable", group: "community", payload: { type: "teachable" } },
  { key: "aicallin", label: "AI Call Incoming", group: "aicall", payload: { type: "aicallin" } },
  { key: "aicallout", label: "AI Call Outgoing", group: "aicall", payload: { type: "aicallout" } },
  { key: "aisetter", label: "AI Call Setter", group: "aicall", payload: { type: "aisetter" } },
  { key: "aicloser", label: "AI Closer", group: "aicall", payload: { type: "aicloser" } },
  { key: "openai", label: "OpenAI", group: "aiauto", payload: { type: "openai" } },
  { key: "chatgpt", label: "ChatGPT", group: "aiauto", payload: { type: "chatgpt" } },
  { key: "anthropic", label: "Anthropic", group: "aiauto", payload: { type: "anthropic" } },
  { key: "voicetotext", label: "Voice-to-Text", group: "aiauto", payload: { type: "voicetotext" } },
  { key: "texttospeech", label: "Text-to-Speech", group: "aiauto", payload: { type: "texttospeech" } },
  { key: "imagegen", label: "Image Generation", group: "aiauto", payload: { type: "imagegen" } },
  { key: "videogen", label: "Video Generation", group: "aiauto", payload: { type: "videogen" } },
  { key: "dataanalytics", label: "Data Analytics", group: "aiauto", payload: { type: "dataanalytics" } },
  { key: "writecode", label: "Write Code", group: "aiauto", payload: { type: "writecode" } },
];

/** Expected size of the approved library (tests and the sidebar heading read it). */
export const LIBRARY_SIZE = 170;

export const ITEMS: LibItem[] = RAW.map((x) => {
  const T = isBlockType(x.payload.type) ? BLOCK_TYPES[x.payload.type as BlockTypeKey] : undefined;
  return { ...x, icon: x.icon ?? T?.icon ?? "zap", kw: [x.kw, T?.kw, T && T.label !== x.label ? T.label : ""].filter(Boolean).join(" ") };
});

export const BY_KEY: Record<string, LibItem> = Object.fromEntries(ITEMS.map((x) => [x.key, x]));

/** Number of items per library category (computed, never hard-coded). */
export const groupCounts = (items: LibItem[] = ITEMS): Record<LibGroup, number> => {
  const c = Object.fromEntries(Object.keys(LIB_GROUPS).map((g) => [g, 0])) as Record<LibGroup, number>;
  for (const it of items) c[it.group]++;
  return c;
};

/** Library search (sidebar, Quick Add and `/`): label, keywords and group name, case-insensitive; every word must match. */
export function searchLibrary(query: string, items: LibItem[] = ITEMS): LibItem[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return items;
  return items.filter((it) => {
    const hay = `${it.label} ${it.kw} ${LIB_GROUPS[it.group]}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
