// Hand-maintained types mirroring supabase/migrations.
// Keep in sync with the SQL schema (or regenerate with the Supabase CLI later).

export type OrderStatus =
  | "NEW"
  | "ACCEPTED"
  | "PREPARING"
  | "READY"
  | "COMPLETED"
  | "CANCELLED";

export type PaymentStatus =
  | "INITIATED"
  | "PENDING"
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED";

export type OrderSource = "QR" | "KIOSK";
export type ItemBadge = "POPULAR" | "BESTSELLER" | "NEW";

export type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: string;
  created_at: string;
  updated_at: string;
}

export type Business = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  logo_url: string | null;
  address: string | null;
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
  open_time: string | null;
  close_time: string | null;
  prep_time_min: number | null;
  prep_time_max: number | null;
  is_open: boolean;
  accepting_orders: boolean;
  tax_percent: number;
  onboarding_complete: boolean;
  order_seq: number;
  created_at: string;
  updated_at: string;
}

export type Category = {
  id: string;
  business_id: string;
  name: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type Item = {
  id: string;
  business_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  display_order: number;
  badge: ItemBadge | null;
  prep_time_min: number | null;
  created_at: string;
  updated_at: string;
}

export type Order = {
  id: string;
  business_id: string;
  order_number: number | null;
  customer_name: string | null;
  source: OrderSource;
  status: OrderStatus;
  subtotal: number;
  tax_amount: number;
  total: number;
  payment_status: PaymentStatus;
  placed_at: string;
  confirmed_at: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export type OrderItem = {
  id: string;
  order_id: string;
  item_id: string | null;
  item_name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
  created_at: string;
}

export type Payment = {
  id: string;
  order_id: string;
  business_id: string;
  status: PaymentStatus;
  amount: number;
  gateway: string | null;
  gateway_ref: string | null;
  gateway_event_id: string | null;
  created_at: string;
  updated_at: string;
}

type Ins<T, Optional extends keyof T> = Omit<T, Optional> & Partial<Pick<T, Optional>>;

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Ins<Profile, "created_at" | "updated_at" | "full_name" | "phone" | "avatar_url" | "role">;
        Update: Partial<Profile>;
        Relationships: [];
      };
      businesses: {
        Row: Business;
        Insert: Ins<
          Business,
          | "id"
          | "created_at"
          | "updated_at"
          | "description"
          | "logo_url"
          | "address"
          | "pincode"
          | "latitude"
          | "longitude"
          | "open_time"
          | "close_time"
          | "prep_time_min"
          | "prep_time_max"
          | "is_open"
          | "accepting_orders"
          | "tax_percent"
          | "onboarding_complete"
          | "order_seq"
          | "category"
        >;
        Update: Partial<Business>;
        Relationships: [];
      };
      categories: {
        Row: Category;
        Insert: Ins<Category, "id" | "created_at" | "updated_at" | "display_order" | "is_active">;
        Update: Partial<Category>;
        Relationships: [];
      };
      items: {
        Row: Item;
        Insert: Ins<
          Item,
          | "id"
          | "created_at"
          | "updated_at"
          | "description"
          | "image_url"
          | "is_available"
          | "display_order"
          | "badge"
          | "prep_time_min"
          | "category_id"
        >;
        Update: Partial<Item>;
        Relationships: [];
      };
      orders: {
        Row: Order;
        Insert: Ins<
          Order,
          | "id"
          | "created_at"
          | "updated_at"
          | "order_number"
          | "customer_name"
          | "source"
          | "status"
          | "subtotal"
          | "tax_amount"
          | "total"
          | "payment_status"
          | "placed_at"
          | "confirmed_at"
          | "cancel_reason"
          | "cancelled_at"
        >;
        Update: Partial<Order>;
        Relationships: [];
      };
      order_items: {
        Row: OrderItem;
        Insert: Ins<OrderItem, "id" | "created_at" | "item_id">;
        Update: Partial<OrderItem>;
        Relationships: [];
      };
      payments: {
        Row: Payment;
        Insert: Ins<
          Payment,
          "id" | "created_at" | "updated_at" | "status" | "gateway" | "gateway_ref" | "gateway_event_id"
        >;
        Update: Partial<Payment>;
        Relationships: [];
      };
    };
    Views: {
      [key: string]: {
        Row: Record<string, unknown>;
        Relationships: [];
      };
    };
    Functions: {
      assign_order_number: {
        Args: { p_order_id: string };
        Returns: number;
      };
      cancel_order: {
        Args: { p_order_id: string; p_reason: string };
        Returns: undefined;
      };
    };
    Enums: {
      order_status: OrderStatus;
      payment_status: PaymentStatus;
      order_source: OrderSource;
      item_badge: ItemBadge;
    };
    CompositeTypes: {
      [key: string]: never;
    };
  };
}
