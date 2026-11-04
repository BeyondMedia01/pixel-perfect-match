export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          changes: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          matter_id: string | null
          summary: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          matter_id?: string | null
          summary?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          matter_id?: string | null
          summary?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      announcements: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          matter_id: string | null
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          matter_id?: string | null
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          matter_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_rates: {
        Row: {
          hourly_rate: number
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          hourly_rate: number
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          hourly_rate?: number
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_rates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_connections: {
        Row: {
          access_token: string
          account_email: string | null
          calendar_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          last_error: string | null
          last_synced_at: string | null
          provider: string
          refresh_token: string | null
          sync_state: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          account_email?: string | null
          calendar_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          provider: string
          refresh_token?: string | null
          sync_state?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          account_email?: string | null
          calendar_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          provider?: string
          refresh_token?: string | null
          sync_state?: string | null
          user_id?: string
        }
        Relationships: []
      }
      calendar_event_links: {
        Row: {
          connection_id: string
          event_id: string | null
          id: string
          pushed_hash: string | null
          remote_id: string
          remote_version: string | null
          updated_at: string
        }
        Insert: {
          connection_id: string
          event_id?: string | null
          id?: string
          pushed_hash?: string | null
          remote_id: string
          remote_version?: string | null
          updated_at?: string
        }
        Update: {
          connection_id?: string
          event_id?: string | null
          id?: string
          pushed_hash?: string | null
          remote_id?: string
          remote_version?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      calendar_feeds: {
        Row: {
          created_at: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          token?: string
          user_id: string
        }
        Update: {
          created_at?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_feeds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_oauth_states: {
        Row: {
          created_at: string
          provider: string
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          provider: string
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          provider?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      client_intake_submissions: {
        Row: {
          created_at: string
          email: string
          id: string
          inquiry_id: string
          name: string
          phone: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          inquiry_id: string
          name: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          inquiry_id?: string
          name?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_intake_submissions_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          id_number: string | null
          name: string
          notes: string | null
          phone: string | null
          type: Database["public"]["Enums"]["client_type"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          id_number?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          type?: Database["public"]["Enums"]["client_type"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          id_number?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          type?: Database["public"]["Enums"]["client_type"]
          updated_at?: string
        }
        Relationships: []
      }
      demo_settings: {
        Row: {
          enabled: boolean
          frontdesk_id: string | null
          id: number
          lawyer_id: string | null
          paralegal_id: string | null
          partner_id: string | null
          password: string | null
          refreshed_at: string | null
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          frontdesk_id?: string | null
          id?: number
          lawyer_id?: string | null
          paralegal_id?: string | null
          partner_id?: string | null
          password?: string | null
          refreshed_at?: string | null
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          frontdesk_id?: string | null
          id?: number
          lawyer_id?: string | null
          paralegal_id?: string | null
          partner_id?: string | null
          password?: string | null
          refreshed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          client_id: string | null
          content_type: string | null
          created_at: string
          file_path: string
          id: string
          matter_id: string | null
          name: string
          size_bytes: number | null
          uploaded_by: string | null
        }
        Insert: {
          client_id?: string | null
          content_type?: string | null
          created_at?: string
          file_path: string
          id?: string
          matter_id?: string | null
          name: string
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Update: {
          client_id?: string | null
          content_type?: string | null
          created_at?: string
          file_path?: string
          id?: string
          matter_id?: string | null
          name?: string
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          confirmed_by: string | null
          created_at: string
          ends_at: string | null
          entered_by: string | null
          filed_at: string | null
          id: string
          inquiry_id: string | null
          location: string | null
          matter_id: string | null
          owner_id: string | null
          reminder_days: number[]
          starts_at: string
          title: string
          type: Database["public"]["Enums"]["event_type"]
        }
        Insert: {
          confirmed_by?: string | null
          created_at?: string
          ends_at?: string | null
          entered_by?: string | null
          filed_at?: string | null
          id?: string
          inquiry_id?: string | null
          location?: string | null
          matter_id?: string | null
          owner_id?: string | null
          reminder_days?: number[]
          starts_at: string
          title: string
          type?: Database["public"]["Enums"]["event_type"]
        }
        Update: {
          confirmed_by?: string | null
          created_at?: string
          ends_at?: string | null
          entered_by?: string | null
          filed_at?: string | null
          id?: string
          inquiry_id?: string | null
          location?: string | null
          matter_id?: string | null
          owner_id?: string | null
          reminder_days?: number[]
          starts_at?: string
          title?: string
          type?: Database["public"]["Enums"]["event_type"]
        }
        Relationships: [
          {
            foreignKeyName: "events_inquiry_id_fkey"
            columns: ["inquiry_id"]
            isOneToOne: false
            referencedRelation: "inquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_settings: {
        Row: {
          address: string | null
          bank_details: string | null
          email: string | null
          firm_name: string | null
          id: number
          invoice_footer: string | null
          logo_path: string | null
          phone: string | null
          registration_no: string | null
          updated_at: string
          updated_by: string | null
          vat_number: string | null
          vat_rate: number
          website: string | null
        }
        Insert: {
          address?: string | null
          bank_details?: string | null
          email?: string | null
          firm_name?: string | null
          id?: number
          invoice_footer?: string | null
          logo_path?: string | null
          phone?: string | null
          registration_no?: string | null
          updated_at?: string
          updated_by?: string | null
          vat_number?: string | null
          vat_rate?: number
          website?: string | null
        }
        Update: {
          address?: string | null
          bank_details?: string | null
          email?: string | null
          firm_name?: string | null
          id?: number
          invoice_footer?: string | null
          logo_path?: string | null
          phone?: string | null
          registration_no?: string | null
          updated_at?: string
          updated_by?: string | null
          vat_number?: string | null
          vat_rate?: number
          website?: string | null
        }
        Relationships: []
      }
      inquiries: {
        Row: {
          consult_event_id: string | null
          consult_with: string | null
          contact: string | null
          created_at: string
          decline_reason: string | null
          id: string
          logged_by: string | null
          matter_id: string | null
          name: string
          opposing_party: string
          practice_area: Database["public"]["Enums"]["practice_area"]
          received_at: string
          related_names: string | null
          signoff_at: string | null
          signoff_basis: string | null
          signoff_by: string | null
          signoff_note: string | null
          status: Database["public"]["Enums"]["inquiry_status"]
          summary: string | null
        }
        Insert: {
          consult_event_id?: string | null
          consult_with?: string | null
          contact?: string | null
          created_at?: string
          decline_reason?: string | null
          id?: string
          logged_by?: string | null
          matter_id?: string | null
          name: string
          opposing_party?: string
          practice_area?: Database["public"]["Enums"]["practice_area"]
          received_at?: string
          related_names?: string | null
          signoff_at?: string | null
          signoff_basis?: string | null
          signoff_by?: string | null
          signoff_note?: string | null
          status?: Database["public"]["Enums"]["inquiry_status"]
          summary?: string | null
        }
        Update: {
          consult_event_id?: string | null
          consult_with?: string | null
          contact?: string | null
          created_at?: string
          decline_reason?: string | null
          id?: string
          logged_by?: string | null
          matter_id?: string | null
          name?: string
          opposing_party?: string
          practice_area?: Database["public"]["Enums"]["practice_area"]
          received_at?: string
          related_names?: string | null
          signoff_at?: string | null
          signoff_basis?: string | null
          signoff_by?: string | null
          signoff_note?: string | null
          status?: Database["public"]["Enums"]["inquiry_status"]
          summary?: string | null
        }
        Relationships: []
      }
      intake_rate_limits: {
        Row: {
          key: string
          requests: number
          window_start: string
        }
        Insert: {
          key: string
          requests?: number
          window_start: string
        }
        Update: {
          key?: string
          requests?: number
          window_start?: string
        }
        Relationships: []
      }
      invoice_counters: {
        Row: {
          last_number: number
          year: number
        }
        Insert: {
          last_number: number
          year: number
        }
        Update: {
          last_number?: number
          year?: number
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          description: string
          id: string
          invoice_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          description: string
          id?: string
          invoice_id: string
          quantity?: number
          unit_price?: number
        }
        Update: {
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          tax_rate: number | null
          client_id: string
          created_at: string
          created_by: string | null
          due_date: string
          id: string
          invoice_number: string
          issue_date: string
          matter_id: string
          notes: string | null
          status: Database["public"]["Enums"]["invoice_status"]
        }
        Insert: {
          tax_rate?: number | null
          client_id: string
          created_at?: string
          created_by?: string | null
          due_date?: string
          id?: string
          invoice_number: string
          issue_date?: string
          matter_id: string
          notes?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
        }
        Update: {
          tax_rate?: number | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          due_date?: string
          id?: string
          invoice_number?: string
          issue_date?: string
          matter_id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_assignments: {
        Row: {
          created_at: string
          id: string
          matter_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          matter_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          matter_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matter_assignments_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_ethical_walls: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          matter_id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          matter_id: string
          reason?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          matter_id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matter_ethical_walls_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_ethical_walls_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matters: {
        Row: {
          case_number: string | null
          client_id: string
          court: string | null
          created_at: string
          created_by: string | null
          date_closed: string | null
          date_opened: string
          description: string | null
          id: string
          matter_number: string | null
          opposing_counsel: string | null
          opposing_party: string | null
          practice_area: Database["public"]["Enums"]["practice_area"]
          responsible_lawyer_id: string | null
          status: Database["public"]["Enums"]["matter_status"]
          title: string
          updated_at: string
        }
        Insert: {
          case_number?: string | null
          client_id: string
          court?: string | null
          created_at?: string
          created_by?: string | null
          date_closed?: string | null
          date_opened?: string
          description?: string | null
          id?: string
          matter_number?: string | null
          opposing_counsel?: string | null
          opposing_party?: string | null
          practice_area?: Database["public"]["Enums"]["practice_area"]
          responsible_lawyer_id?: string | null
          status?: Database["public"]["Enums"]["matter_status"]
          title: string
          updated_at?: string
        }
        Update: {
          case_number?: string | null
          client_id?: string
          court?: string | null
          created_at?: string
          created_by?: string | null
          date_closed?: string | null
          date_opened?: string
          description?: string | null
          id?: string
          matter_number?: string | null
          opposing_counsel?: string | null
          opposing_party?: string | null
          practice_area?: Database["public"]["Enums"]["practice_area"]
          responsible_lawyer_id?: string | null
          status?: Database["public"]["Enums"]["matter_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matters_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matters_responsible_lawyer_id_fkey"
            columns: ["responsible_lawyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          matter_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          matter_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          matter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_dismissals: {
        Row: {
          dismissed_at: string
          notification_key: string
          user_id: string
        }
        Insert: {
          dismissed_at?: string
          notification_key: string
          user_id: string
        }
        Update: {
          dismissed_at?: string
          notification_key?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          announcements: boolean
          email_announcements: boolean
          email_new_inquiries: boolean
          email_tasks_assigned: boolean
          email_tasks_due_today: boolean
          email_unconfirmed_deadlines: boolean
          email_upcoming_hearings: boolean
          new_inquiries: boolean
          tasks_assigned: boolean
          tasks_due_today: boolean
          unconfirmed_deadlines: boolean
          upcoming_hearings: boolean
          updated_at: string
          user_id: string
          whatsapp_announcements: boolean
          whatsapp_new_inquiries: boolean
          whatsapp_number: string | null
          whatsapp_tasks_assigned: boolean
          whatsapp_tasks_due_today: boolean
          whatsapp_unconfirmed_deadlines: boolean
          whatsapp_upcoming_hearings: boolean
        }
        Insert: {
          announcements?: boolean
          email_announcements?: boolean
          email_new_inquiries?: boolean
          email_tasks_assigned?: boolean
          email_tasks_due_today?: boolean
          email_unconfirmed_deadlines?: boolean
          email_upcoming_hearings?: boolean
          new_inquiries?: boolean
          tasks_assigned?: boolean
          tasks_due_today?: boolean
          unconfirmed_deadlines?: boolean
          upcoming_hearings?: boolean
          updated_at?: string
          user_id: string
          whatsapp_announcements?: boolean
          whatsapp_new_inquiries?: boolean
          whatsapp_number?: string | null
          whatsapp_tasks_assigned?: boolean
          whatsapp_tasks_due_today?: boolean
          whatsapp_unconfirmed_deadlines?: boolean
          whatsapp_upcoming_hearings?: boolean
        }
        Update: {
          announcements?: boolean
          email_announcements?: boolean
          email_new_inquiries?: boolean
          email_tasks_assigned?: boolean
          email_tasks_due_today?: boolean
          email_unconfirmed_deadlines?: boolean
          email_upcoming_hearings?: boolean
          new_inquiries?: boolean
          tasks_assigned?: boolean
          tasks_due_today?: boolean
          unconfirmed_deadlines?: boolean
          upcoming_hearings?: boolean
          updated_at?: string
          user_id?: string
          whatsapp_announcements?: boolean
          whatsapp_new_inquiries?: boolean
          whatsapp_number?: string | null
          whatsapp_tasks_assigned?: boolean
          whatsapp_tasks_due_today?: boolean
          whatsapp_unconfirmed_deadlines?: boolean
          whatsapp_upcoming_hearings?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          onboarded_at: string | null
          phone: string | null
          title: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          onboarded_at?: string | null
          phone?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          onboarded_at?: string | null
          phone?: string | null
          title?: string | null
        }
        Relationships: []
      }
      related_parties: {
        Row: {
          created_at: string
          email: string | null
          id: string
          matter_id: string
          name: string
          organisation: string | null
          phone: string | null
          role: Database["public"]["Enums"]["party_role"]
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          matter_id: string
          name: string
          organisation?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["party_role"]
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          matter_id?: string
          name?: string
          organisation?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["party_role"]
        }
        Relationships: [
          {
            foreignKeyName: "related_parties_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          matter_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          status: Database["public"]["Enums"]["task_status"]
          title: string
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          matter_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          title: string
        }
        Update: {
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          matter_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invitations: {
        Row: {
          accepted_at: string | null
          accepted_user_id: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          invited_by: string | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "team_invitations_accepted_user_id_fkey"
            columns: ["accepted_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          billable: boolean
          created_at: string
          description: string
          entry_date: string
          hourly_rate: number
          hours: number
          id: string
          invoice_id: string | null
          matter_id: string
          user_id: string
        }
        Insert: {
          billable?: boolean
          created_at?: string
          description: string
          entry_date?: string
          hourly_rate?: number
          hours: number
          id?: string
          invoice_id?: string | null
          matter_id: string
          user_id: string
        }
        Update: {
          billable?: boolean
          created_at?: string
          description?: string
          entry_date?: string
          hourly_rate?: number
          hours?: number
          id?: string
          invoice_id?: string | null
          matter_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_invoice_fk"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      complete_onboarding: {
        Args: { _firm?: Json; _full_name: string; _phone: string; _title: string }
        Returns: undefined
      }
      platform_invite_owner: {
        Args: { _email: string; _firm_name: string; _full_name: string }
        Returns: string
      }
      accept_inquiry: {
        Args: {
          _existing_client_id?: string
          _inquiry_id: string
          _title: string
        }
        Returns: {
          client_id: string
          matter_id: string
        }[]
      }
      calendar_events_for_user: {
        Args: { _user_id: string }
        Returns: {
          created_at: string
          description: string | null
          ends_at: string | null
          id: string
          inquiry_id: string | null
          location: string | null
          matter_id: string | null
          owner_id: string | null
          starts_at: string
          title: string
          type: string
        }[]
      }
      calendar_feed: {
        Args: { _token: string }
        Returns: {
          all_day_date: string
          description: string
          ends_at: string
          kind: string
          location: string
          starts_at: string
          title: string
          uid: string
          updated_at: string
        }[]
      }
      can_access_client: { Args: { _client_id: string }; Returns: boolean }
      can_access_matter: { Args: { _matter_id: string }; Returns: boolean }
      can_read_document_file: { Args: { _path: string }; Returns: boolean }
      client_directory: {
        Args: never
        Returns: {
          id: string
          name: string
          type: Database["public"]["Enums"]["client_type"]
        }[]
      }
      conflict_check: {
        Args: { q: string }
        Returns: {
          detail: string
          matter_number: string
          name: string
          source: string
        }[]
      }
      conflict_check_count: { Args: { q: string }; Returns: number }
      create_invoice: {
        Args: {
          _due_date: string
          _entry_ids: string[]
          _matter_id: string
          _notes?: string
        }
        Returns: {
          id: string
          invoice_number: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      invite_team_member: {
        Args: {
          _email: string
          _full_name: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: string
      }
      is_frontdesk: { Args: { _user_id: string }; Returns: boolean }
      is_internal: { Args: { _user_id: string }; Returns: boolean }
      is_lawyerish: { Args: { _user_id: string }; Returns: boolean }
      matter_directory: {
        Args: never
        Returns: {
          client_name: string
          date_opened: string
          id: string
          lawyer_name: string
          matter_number: string
          practice_area: Database["public"]["Enums"]["practice_area"]
          status: Database["public"]["Enums"]["matter_status"]
          title: string
        }[]
      }
      my_calendar_connections: {
        Args: never
        Returns: {
          account_email: string | null
          created_at: string
          last_error: string | null
          last_synced_at: string | null
          provider: string
        }[]
      }
      next_invoice_number: { Args: never; Returns: string }
      public_firm_profile: { Args: never; Returns: { firm_name: string | null; logo_path: string | null }[] }
      refresh_demo_data: { Args: never; Returns: undefined }
      seed_demo_firm_profile: { Args: never; Returns: undefined }
      remove_team_member: { Args: { _user_id: string }; Returns: undefined }
      set_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      submit_client_intake: {
        Args: {
          _area: Database["public"]["Enums"]["practice_area"]
          _email: string
          _ip_hash?: string
          _name: string
          _opposing: string
          _phone: string
          _related: string
          _summary: string
        }
        Returns: string
      }
      user_can_access_matter: {
        Args: { _matter_id: string; _user_id: string }
        Returns: boolean
      }
      user_walled_from_matter: {
        Args: { _matter_id: string; _user_id: string }
        Returns: boolean
      }
      walled_from_client: { Args: { _client_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "admin"
        | "lawyer"
        | "staff"
        | "client"
        | "partner"
        | "paralegal"
        | "frontdesk"
      client_type: "individual" | "company"
      event_type:
        | "court_date"
        | "hearing"
        | "meeting"
        | "filing_deadline"
        | "other"
      inquiry_status: "new" | "consult" | "accepted" | "declined"
      invoice_status: "draft" | "sent" | "paid" | "void"
      matter_status: "intake" | "active" | "on_hold" | "closed"
      party_role:
        | "opposing_party"
        | "opposing_counsel"
        | "related_party"
        | "witness"
        | "other"
      practice_area:
        | "litigation"
        | "conveyancing"
        | "corporate"
        | "family"
        | "labour"
        | "criminal"
        | "other"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status: "todo" | "in_progress" | "waiting" | "done"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "lawyer",
        "staff",
        "client",
        "partner",
        "paralegal",
        "frontdesk",
      ],
      client_type: ["individual", "company"],
      event_type: [
        "court_date",
        "hearing",
        "meeting",
        "filing_deadline",
        "other",
      ],
      inquiry_status: ["new", "consult", "accepted", "declined"],
      invoice_status: ["draft", "sent", "paid", "void"],
      matter_status: ["intake", "active", "on_hold", "closed"],
      party_role: [
        "opposing_party",
        "opposing_counsel",
        "related_party",
        "witness",
        "other",
      ],
      practice_area: [
        "litigation",
        "conveyancing",
        "corporate",
        "family",
        "labour",
        "criminal",
        "other",
      ],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["todo", "in_progress", "waiting", "done"],
    },
  },
} as const
