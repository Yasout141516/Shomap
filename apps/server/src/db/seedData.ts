/**
 * Static seed data for the Dhaka demo. People are fictional; area and institution names are
 * real places, and authority accounts are simulated (PRD §8: no real integration).
 */

export const AREAS = [
  { id: "mirpur", nameEn: "Mirpur 10", nameBn: "মিরপুর ১০", cityCorp: "DNCC", lat: 23.8069, lng: 90.3687 },
  { id: "uttara", nameEn: "Uttara", nameBn: "উত্তরা", cityCorp: "DNCC", lat: 23.8759, lng: 90.3795 },
  { id: "gulshan", nameEn: "Gulshan", nameBn: "গুলশান", cityCorp: "DNCC", lat: 23.7806, lng: 90.4167 },
  { id: "banani", nameEn: "Banani", nameBn: "বনানী", cityCorp: "DNCC", lat: 23.794, lng: 90.4043 },
  { id: "mohakhali", nameEn: "Mohakhali", nameBn: "মহাখালী", cityCorp: "DNCC", lat: 23.778, lng: 90.405 },
  { id: "farmgate", nameEn: "Farmgate", nameBn: "ফার্মগেট", cityCorp: "DNCC", lat: 23.7575, lng: 90.3897 },
  { id: "dhanmondi", nameEn: "Dhanmondi", nameBn: "ধানমন্ডি", cityCorp: "DSCC", lat: 23.7461, lng: 90.3742 },
  { id: "mohammadpur", nameEn: "Mohammadpur", nameBn: "মোহাম্মদপুর", cityCorp: "DNCC", lat: 23.7662, lng: 90.3589 },
  { id: "motijheel", nameEn: "Motijheel", nameBn: "মতিঝিল", cityCorp: "DSCC", lat: 23.733, lng: 90.4172 },
  { id: "jatrabari", nameEn: "Jatrabari", nameBn: "যাত্রাবাড়ী", cityCorp: "DSCC", lat: 23.7104, lng: 90.4348 },
  { id: "badda", nameEn: "Badda", nameBn: "বাড্ডা", cityCorp: "DNCC", lat: 23.7815, lng: 90.431 },
  { id: "old_dhaka", nameEn: "Old Dhaka", nameBn: "পুরান ঢাকা", cityCorp: "DSCC", lat: 23.7104, lng: 90.4074 },
] as const;

export type AreaId = (typeof AREAS)[number]["id"];

export const LANDMARKS: Record<AreaId, string[]> = {
  mirpur: ["Mirpur 10 roundabout", "Shah Ali market", "Mirpur 2 stadium gate", "Kazipara foot bridge"],
  uttara: ["House Building bus stop", "Sector 7 park", "Azampur crossing", "Rajlakshmi complex"],
  gulshan: ["Gulshan 1 circle", "Gulshan 2 DCC market", "Police Plaza", "Road 11 lake side"],
  banani: ["Banani road 11", "Kakoli bus stop", "Banani graveyard road", "Chairman Bari"],
  mohakhali: ["Mohakhali bus terminal", "Mohakhali flyover ramp", "Wireless gate", "TB gate"],
  farmgate: ["Farmgate bus stand", "Kawran Bazar crossing", "Indira Road", "Tejgaon College gate"],
  dhanmondi: ["Dhanmondi 27", "Road 8 lake bridge", "Science Lab crossing", "Shankar bus stand"],
  mohammadpur: ["Town Hall market", "Asad Gate", "Krishi Market", "Shyamoli Square"],
  motijheel: ["Shapla Chattar", "Arambagh", "Dilkusha C/A", "Kamalapur station road"],
  jatrabari: ["Jatrabari crossing", "Sayedabad bus terminal", "Kajla bridge", "Shanir Akhra"],
  badda: ["Merul Badda", "Notun Bazar", "Uttar Badda bus stop", "Rampura bridge"],
  old_dhaka: ["Sadarghat launch terminal", "Chawkbazar", "Lalbagh fort road", "Nazira Bazar"],
};

type AuthorityType = "police" | "traffic" | "city_corp" | "wasa";
export interface AuthoritySeed {
  id: string;
  nameEn: string;
  nameBn: string;
  type: AuthorityType;
  areas: AreaId[];
}

const ALL_AREAS = AREAS.map((a) => a.id);
const NORTH = AREAS.filter((a) => a.cityCorp === "DNCC").map((a) => a.id);
const SOUTH = AREAS.filter((a) => a.cityCorp === "DSCC").map((a) => a.id);

export const AUTHORITIES: AuthoritySeed[] = [
  { id: "thana-mirpur", nameEn: "Mirpur Model Thana", nameBn: "মিরপুর মডেল থানা", type: "police", areas: ["mirpur"] },
  { id: "thana-uttara", nameEn: "Uttara West Thana", nameBn: "উত্তরা পশ্চিম থানা", type: "police", areas: ["uttara"] },
  { id: "thana-gulshan", nameEn: "Gulshan Thana", nameBn: "গুলশান থানা", type: "police", areas: ["gulshan"] },
  { id: "thana-banani", nameEn: "Banani Thana", nameBn: "বনানী থানা", type: "police", areas: ["banani"] },
  { id: "thana-tejgaon", nameEn: "Tejgaon Thana", nameBn: "তেজগাঁও থানা", type: "police", areas: ["farmgate", "mohakhali"] },
  { id: "thana-dhanmondi", nameEn: "Dhanmondi Thana", nameBn: "ধানমন্ডি থানা", type: "police", areas: ["dhanmondi"] },
  { id: "thana-mohammadpur", nameEn: "Mohammadpur Thana", nameBn: "মোহাম্মদপুর থানা", type: "police", areas: ["mohammadpur"] },
  { id: "thana-motijheel", nameEn: "Motijheel Thana", nameBn: "মতিঝিল থানা", type: "police", areas: ["motijheel"] },
  { id: "thana-jatrabari", nameEn: "Jatrabari Thana", nameBn: "যাত্রাবাড়ী থানা", type: "police", areas: ["jatrabari"] },
  { id: "thana-badda", nameEn: "Badda Thana", nameBn: "বাড্ডা থানা", type: "police", areas: ["badda"] },
  { id: "thana-kotwali", nameEn: "Kotwali Thana", nameBn: "কোতোয়ালি থানা", type: "police", areas: ["old_dhaka"] },
  { id: "dmp-traffic", nameEn: "DMP Traffic Division", nameBn: "ডিএমপি ট্রাফিক বিভাগ", type: "traffic", areas: ALL_AREAS },
  { id: "dncc", nameEn: "Dhaka North City Corporation", nameBn: "ঢাকা উত্তর সিটি কর্পোরেশন", type: "city_corp", areas: NORTH },
  { id: "dscc", nameEn: "Dhaka South City Corporation", nameBn: "ঢাকা দক্ষিণ সিটি কর্পোরেশন", type: "city_corp", areas: SOUTH },
  { id: "wasa", nameEn: "Dhaka WASA", nameBn: "ঢাকা ওয়াসা", type: "wasa", areas: ALL_AREAS },
];

export const CATEGORIES = [
  { key: "mugging", nameEn: "Mugging / snatching", nameBn: "ছিনতাই", kind: "light_crime", icon: "hand-grab", defaultUrgency: "high", authorityType: "police", anonymousDefault: false },
  { key: "pickpocket", nameEn: "Pickpocketing", nameBn: "পকেটমার", kind: "light_crime", icon: "wallet", defaultUrgency: "medium", authorityType: "police", anonymousDefault: false },
  { key: "extortion", nameEn: "Extortion", nameBn: "চাঁদাবাজি", kind: "light_crime", icon: "badge-dollar", defaultUrgency: "high", authorityType: "police", anonymousDefault: true },
  { key: "harassment", nameEn: "Public harassment", nameBn: "হয়রানি", kind: "light_crime", icon: "shield-alert", defaultUrgency: "high", authorityType: "police", anonymousDefault: true },
  { key: "missing_child", nameEn: "Missing child", nameBn: "নিখোঁজ শিশু", kind: "special", icon: "baby", defaultUrgency: "critical", authorityType: "police", anonymousDefault: false, triggersSos: true },
  { key: "traffic", nameEn: "Traffic mismanagement", nameBn: "যানজট", kind: "civic", icon: "traffic-cone", defaultUrgency: "medium", authorityType: "traffic", anonymousDefault: false },
  { key: "vendor", nameEn: "Illegal vendor / footpath blocked", nameBn: "ফুটপাত দখল", kind: "civic", icon: "store", defaultUrgency: "low", authorityType: "city_corp", anonymousDefault: false },
  { key: "garbage", nameEn: "Garbage dumping", nameBn: "ময়লা ফেলা", kind: "civic", icon: "trash", defaultUrgency: "low", authorityType: "city_corp", anonymousDefault: false },
  { key: "waterlogging", nameEn: "Waterlogging / drainage", nameBn: "জলাবদ্ধতা", kind: "civic", icon: "waves", defaultUrgency: "medium", authorityType: "wasa", anonymousDefault: false },
  { key: "road", nameEn: "Broken road / streetlight", nameBn: "ভাঙা রাস্তা / বাতি", kind: "civic", icon: "construction", defaultUrgency: "low", authorityType: "city_corp", anonymousDefault: false },
  { key: "other", nameEn: "Other", nameBn: "অন্যান্য", kind: "civic", icon: "circle-help", defaultUrgency: "low", authorityType: null, anonymousDefault: false },
  { key: "violent_crime", nameEn: "Assault, sexual violence or other violent crime", nameBn: "মারধর, যৌন সহিংসতা বা অন্য গুরুতর অপরাধ", kind: "blocked", icon: "siren", defaultUrgency: "critical", authorityType: null, anonymousDefault: false, isBlocked: true, redirectHotline: "999" },
  { key: "domestic_violence", nameEn: "Domestic violence / violence against women or children", nameBn: "পারিবারিক সহিংসতা / নারী ও শিশু নির্যাতন", kind: "blocked", icon: "heart-handshake", defaultUrgency: "critical", authorityType: null, anonymousDefault: false, isBlocked: true, redirectHotline: "109" },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]["key"];

/** Fictional residents. `hero` marks the people the §11 demo script uses. */
export const CITIZENS: { id: string; name: string; phone: string; home: AreaId; lang?: "en" | "bn"; hero?: string }[] = [
  { id: "u-rahim", name: "Rahim Uddin", phone: "01710000001", home: "farmgate", hero: "Reporter (Farmgate)" },
  { id: "u-nila", name: "Nila Akter", phone: "01710000002", home: "farmgate", hero: "Neighbour who confirms" },
  { id: "u-tanvir", name: "Tanvir Hasan", phone: "01710000003", home: "mohakhali", hero: "Neighbour who confirms" },
  { id: "u-rafiq", name: "Rafiq Ahmed", phone: "01710000004", home: "farmgate", hero: "Neighbour who confirms" },
  { id: "u-shirin", name: "Shirin Begum", phone: "01710000005", home: "mirpur", lang: "bn", hero: "Parent (SOS)" },
  { id: "u-arif", name: "Arif Chowdhury", phone: "01710000006", home: "uttara", hero: "Watches Mirpur 10 (gets SOS)" },
  { id: "u-nusrat", name: "Nusrat Jahan", phone: "01710000007", home: "mirpur" },
  { id: "u-farhana", name: "Farhana Yasmin", phone: "01710000008", home: "dhanmondi" },
  { id: "u-kamal", name: "Kamal Hossain", phone: "01710000009", home: "motijheel" },
  { id: "u-mitu", name: "Mitu Rani Das", phone: "01710000010", home: "old_dhaka", lang: "bn" },
  { id: "u-jahid", name: "Jahid Hasan", phone: "01710000011", home: "uttara" },
  { id: "u-rubina", name: "Rubina Khatun", phone: "01710000012", home: "jatrabari", lang: "bn" },
  { id: "u-imran", name: "Imran Kabir", phone: "01710000013", home: "gulshan" },
  { id: "u-tasnim", name: "Tasnim Ahmed", phone: "01710000014", home: "banani" },
  { id: "u-sumon", name: "Sumon Mia", phone: "01710000015", home: "badda", lang: "bn" },
  { id: "u-priya", name: "Priya Saha", phone: "01710000016", home: "mohammadpur" },
  { id: "u-habib", name: "Habib Rahman", phone: "01710000017", home: "mohakhali" },
  { id: "u-lamia", name: "Lamia Chowdhury", phone: "01710000018", home: "dhanmondi" },
];

export const ADMIN = { id: "u-admin", name: "ShoMap Moderator", phone: "01700000001" };

/** How many seeded incidents of each category land in each area (78 in total). */
export const PATTERN: [CategoryKey, AreaId, number][] = [
  ["mugging", "farmgate", 6], ["mugging", "mohakhali", 4], ["mugging", "mirpur", 2], ["mugging", "jatrabari", 2], ["mugging", "motijheel", 1],
  ["pickpocket", "farmgate", 3], ["pickpocket", "motijheel", 3], ["pickpocket", "old_dhaka", 2],
  ["extortion", "jatrabari", 3], ["extortion", "mirpur", 2], ["extortion", "old_dhaka", 1],
  ["harassment", "farmgate", 2], ["harassment", "dhanmondi", 2], ["harassment", "uttara", 1], ["harassment", "mohammadpur", 1],
  ["traffic", "farmgate", 3], ["traffic", "jatrabari", 3], ["traffic", "mohakhali", 2], ["traffic", "banani", 1], ["traffic", "badda", 2],
  ["vendor", "motijheel", 2], ["vendor", "farmgate", 2], ["vendor", "gulshan", 1], ["vendor", "mirpur", 2],
  ["garbage", "old_dhaka", 3], ["garbage", "jatrabari", 2], ["garbage", "mohammadpur", 2], ["garbage", "badda", 1],
  ["waterlogging", "motijheel", 3], ["waterlogging", "old_dhaka", 2], ["waterlogging", "mirpur", 1], ["waterlogging", "dhanmondi", 1],
  ["road", "uttara", 3], ["road", "badda", 2], ["road", "mohammadpur", 1], ["road", "gulshan", 1],
  ["other", "dhanmondi", 1], ["other", "banani", 1], ["other", "uttara", 1],
];

export const DESCRIPTIONS: Record<Exclude<CategoryKey, "missing_child" | "violent_crime" | "domestic_violence">, string[]> = {
  mugging: [
    "Two men on a motorbike snatched a woman's phone and sped towards the flyover.",
    "Bag snatched from a rickshaw passenger near the signal. Happens almost every evening here.",
    "Group of 3 teenagers surrounding people waiting for buses and grabbing phones.",
    "আমার ফোন ছিনতাই হয়েছে বাস থেকে নামার সময়। দুইজন ছিল, মোটরসাইকেলে পালিয়েছে।",
    "Snatcher pulled a gold chain from an elderly man and ran into the market lane.",
  ],
  pickpocket: [
    "Wallet stolen inside a crowded bus during rush hour. Several people lost phones too.",
    "Pickpockets working the crowd at the bus stand. Watch your back pockets.",
    "ভিড়ের মধ্যে মানিব্যাগ চুরি হয়ে গেছে। এখানে প্রায়ই এমন হয়।",
  ],
  extortion: [
    "Men collecting 'line money' from every tea stall every week. Shopkeepers are scared to complain.",
    "Leguna drivers forced to pay a daily fee at the stand or they can't load passengers.",
    "প্রতিদিন দোকানদারদের কাছ থেকে চাঁদা তোলা হচ্ছে। না দিলে হুমকি দেয়।",
  ],
  harassment: [
    "Men passing comments at girls walking to college every morning near the gate.",
    "A man followed two schoolgirls for several blocks. Locals stepped in.",
    "রাস্তায় মেয়েদের উত্যক্ত করা হচ্ছে, বিশেষ করে সন্ধ্যার পর।",
  ],
  traffic: [
    "Signal not working and no traffic police. Total gridlock for 40 minutes.",
    "Buses stopping in the middle of the road to pick up passengers, blocking all lanes.",
    "Wrong-way motorbikes on the flyover ramp. Nearly caused an accident.",
    "সিগন্যাল বন্ধ, কেউ ট্রাফিক নিয়ন্ত্রণ করছে না। এক ঘণ্টা ধরে জ্যাম।",
  ],
  vendor: [
    "Entire footpath taken over by stalls. Pedestrians forced to walk on the road.",
    "New shops built onto the footpath overnight in front of the bank.",
    "ফুটপাত পুরোটাই দোকানে দখল, হাঁটার জায়গা নেই।",
  ],
  garbage: [
    "Garbage piling up next to the school for 5 days. Terrible smell, dogs everywhere.",
    "Waste being dumped into the canal at night.",
    "রাস্তার পাশে ময়লার স্তূপ, কেউ পরিষ্কার করছে না।",
  ],
  waterlogging: [
    "Knee-deep water after 30 minutes of rain. Rickshaws can't pass.",
    "Drain overflowing onto the main road; sewage smell.",
    "অল্প বৃষ্টিতেই হাঁটু পানি জমে যায়। ড্রেন বন্ধ।",
  ],
  road: [
    "Huge pothole in the middle of the lane, motorbikes keep falling.",
    "Streetlights off for a week on the whole stretch. Very unsafe at night.",
    "রাস্তা ভাঙা, রাতে বাতি জ্বলে না।",
  ],
  other: [
    "Loose electric wires hanging low over the footpath after the storm.",
    "Stray dogs attacking people near the playground in the evening.",
  ],
};

export const CITIZEN_COMMENTS = [
  { kind: "update", body: "Still happening today. Saw it again around 7pm." },
  { kind: "comment", body: "Same thing happened to my cousin last month here." },
  { kind: "offer_help", body: "I run a shop here and have CCTV. Happy to share footage with police." },
  { kind: "comment", body: "আমিও দেখেছি। সবাই সাবধানে থাকবেন।" },
  { kind: "update", body: "Better now, but it comes back every evening." },
  { kind: "offer_help", body: "If anyone needs to walk to the bus stand at night, our group walks together at 9pm." },
] as const;

/** Resolution notes for seeded incidents (acknowledge/start use the live defaults). */
export const OFFICIAL_NOTES = {
  resolve: [
    "Patrol increased at this spot from 6pm to 11pm. Two suspects detained.",
    "Cleared and cleaned. Collection schedule fixed for this lane.",
    "Signal repaired and a traffic constable posted at peak hours.",
    "Drain cleared. Will monitor during the next heavy rain.",
    "Footpath cleared of illegal structures.",
  ],
};
