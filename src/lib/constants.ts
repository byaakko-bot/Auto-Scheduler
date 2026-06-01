// UI-facing display metadata for enums.

export const BUILDING_TYPES: { value: string; label: string; icon: string }[] = [
  { value: "RESIDENTIAL_APARTMENT", label: "Residential — Apartment", icon: "Building2" },
  { value: "RESIDENTIAL_HOUSE", label: "Residential — House", icon: "Home" },
  { value: "COMMERCIAL_OFFICE", label: "Commercial — Office", icon: "Briefcase" },
  { value: "COMMERCIAL_RETAIL", label: "Commercial — Retail", icon: "Store" },
  { value: "INDUSTRIAL_WAREHOUSE", label: "Industrial — Warehouse", icon: "Warehouse" },
  { value: "MIXED_USE", label: "Mixed Use", icon: "Layers" },
  { value: "HOSPITALITY", label: "Hospitality", icon: "Hotel" },
  { value: "HEALTHCARE", label: "Healthcare", icon: "Cross" },
  { value: "EDUCATION", label: "Education", icon: "GraduationCap" },
  { value: "INFRASTRUCTURE", label: "Infrastructure", icon: "TrafficCone" },
];

export const CONSTRUCTION_METHODS: {
  value: string;
  label: string;
  description: string;
}[] = [
  { value: "REINFORCED_CONCRETE", label: "Reinforced Concrete", description: "Monolithic RC frame — the baseline, fully modelled." },
  { value: "MASONRY_BLOCKWORK", label: "Masonry / Blockwork", description: "Load-bearing block walls, faster envelope." },
  { value: "STEEL_FRAME", label: "Steel Frame", description: "Fast erection, longer steel procurement lead." },
  { value: "TIMBER_FRAME", label: "Timber Frame", description: "Very fast, engineered timber components." },
  { value: "PRECAST_CONCRETE", label: "Precast Concrete", description: "Off-site elements, fast assembly on site." },
  { value: "MODULAR", label: "Modular", description: "Volumetric modules — fastest on-site programme." },
  { value: "AAC_PANELS", label: "AAC Panels", description: "Autoclaved aerated concrete panels." },
  { value: "AAC_BLOCKS", label: "AAC Blocks", description: "Lightweight blocks, short lead time." },
  { value: "HYBRID", label: "Hybrid", description: "Mixed structural systems." },
];

export const CURRENCIES = ["USD", "EUR", "GBP", "AED", "SAR", "INR", "AUD", "CAD"];

export const STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  DELAYED: "bg-red-100 text-red-700",
  ON_HOLD: "bg-amber-100 text-amber-700",
  CANCELLED: "bg-slate-200 text-slate-500",
};

export const RISK_COLORS: Record<string, string> = {
  LOW: "bg-emerald-100 text-emerald-700",
  MEDIUM: "bg-amber-100 text-amber-700",
  HIGH: "bg-orange-100 text-orange-700",
  CRITICAL: "bg-red-100 text-red-700",
};

export const RACI_COLORS: Record<string, string> = {
  RESPONSIBLE: "bg-emerald-500 text-white",
  ACCOUNTABLE: "bg-amber-500 text-white",
  CONSULTED: "bg-blue-500 text-white",
  INFORMED: "bg-slate-400 text-white",
};

export const RACI_SHORT: Record<string, string> = {
  RESPONSIBLE: "R",
  ACCOUNTABLE: "A",
  CONSULTED: "C",
  INFORMED: "I",
};
