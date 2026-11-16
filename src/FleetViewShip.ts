interface FleetViewShip {
  id: string;
  storeUrl: string;
  name: string;
  description: string;
  size: string;
  rsiName: string;
  focus: string;
  classification: string;
  classificationLabel?: string;
  productionStatus?: string;
  metrics?: { size?: string; sizeLabel?: string; cargo?: number };
  rsiSlug: string;
  slug: string;
  type: string;
  price: number;
  pledgePrice: number;
  lastPledgePrice: number;
  onSale: boolean;
  brochure: string;
  loaners: { slug: string; name: string }[];
}
