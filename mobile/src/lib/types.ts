export type Role = 'owner' | 'manager' | 'safety' | 'gate' | 'driver';
export type DocState = 'valid' | 'expiring' | 'expired' | 'pending' | 'rejected' | 'missing';
export type OwnerType = 'driver' | 'vehicle' | 'company';

export type User = {
  id: number;
  company_id: number;
  name: string;
  phone: string;
  email: string | null;
  role: Role;
  lang: 'ar' | 'en';
  active: boolean;
  id_type: 'national_id' | 'iqama' | null;
  id_number: string | null;
  nationality: string | null;
  license_number: string | null;
  default_vehicle_id: number | null;
  photo_url: string | null;
  location_consent_at: string | null;
  doc_issues?: number;
};

export type Company = { id: number; name: string; cr_number: string | null; vat_number: string | null; city: string | null; phone: string | null };

export type Vehicle = { id: number; plate_number: string; type: string | null; capacity_tons: number | null; active: boolean; driver_name?: string | null };

export type Site = { id: number; name: string; lat: number | null; lng: number | null; radius_m: number; active: boolean };

export type Doc = {
  id: number;
  owner_type: OwnerType;
  owner_id: number;
  owner_name: string | null;
  doc_type: string;
  number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  site_id: number | null;
  status: 'pending' | 'approved' | 'rejected';
  state: DocState;
  days_left: number | null;
  notes: string | null;
  file_url: string | null;
  file_mime: string | null;
  file_name: string | null;
  created_at: string;
};

export type Alert = {
  kind: 'expired' | 'expiring' | 'pending' | 'missing' | 'rejected';
  document_id?: number;
  owner_type: OwnerType;
  owner_id: number;
  owner_name: string | null;
  doc_type: string;
  expiry_date?: string | null;
  days_left?: number | null;
  requirement?: string;
};

export type GateCheck = { requirement: string; doc_type: string; state: DocState; expiry_date: string | null; days_left: number | null; ok: boolean };
export type GateReason = { code: string; requirement?: string; doc_type?: string; expiry_date?: string | null; days_left?: number };

export type GateResult = {
  verdict: 'allowed' | 'denied';
  checks: GateCheck[];
  reasons: GateReason[];
  warnings: GateReason[];
  driver: { id: number; name: string; nationality: string | null; photo_url: string | null };
  company_name: string;
  vehicle: { id: number; plate_number: string; type: string | null } | null;
  trip_id?: number | null;
};

export type Pass = {
  token: string;
  code: string;
  expires_at: string;
  qr_value: string;
  status: { verdict: 'allowed' | 'denied'; checks: GateCheck[]; reasons: GateReason[]; warnings: GateReason[] };
  driver: GateResult['driver'];
  company_name: string;
  vehicle: GateResult['vehicle'];
};

export type Trip = {
  id: number;
  driver_id: number;
  driver_name: string;
  driver_phone: string;
  vehicle_id: number | null;
  plate_number: string | null;
  site_id: number | null;
  site_name: string | null;
  site_lat: number | null;
  site_lng: number | null;
  schedule_entry_id: number | null;
  status: 'en_route' | 'arrived' | 'completed' | 'cancelled';
  load_type: string | null;
  started_at: string;
  arrived_at: string | null;
  arrival_method: string | null;
  completed_at: string | null;
  weight_tons: number | null;
  ticket_number: string | null;
  ticket_url: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_location_at: string | null;
  minutes_since_update: number | null;
  distance_to_site_m: number | null;
  invoice_id: number | null;
};

export type ScheduleEntry = {
  id: number;
  date: string;
  driver_id: number;
  driver_name: string;
  driver_phone: string;
  vehicle_id: number | null;
  plate_number: string | null;
  site_id: number | null;
  site_name: string | null;
  shift: 'morning' | 'evening' | 'night';
  planned_trips: number;
  notes: string | null;
  completed_trips: number;
  gate_entries: number;
};

export type GateLog = {
  id: number;
  driver_name: string;
  plate_number: string | null;
  site_name: string | null;
  verdict: 'allowed' | 'denied';
  reasons: GateReason[];
  direction: 'in' | 'out';
  source: 'app' | 'public';
  scanned_by_name: string | null;
  created_at: string;
};

export type InvoiceLine = { id: number; trip_id: number | null; description: string; quantity: number; unit: 'trip' | 'ton' | 'item'; unit_price: number; amount: number };

export type Invoice = {
  id: number;
  number: string | null;
  client_name: string;
  client_vat_number: string | null;
  week_start: string;
  week_end: string;
  status: 'draft' | 'approved' | 'paid';
  currency: string;
  vat_rate: number;
  subtotal: number;
  vat_amount: number;
  total: number;
  notes: string | null;
  lines?: InvoiceLine[];
  print_url?: string;
  created_by_name?: string | null;
  approved_by_name?: string | null;
};
