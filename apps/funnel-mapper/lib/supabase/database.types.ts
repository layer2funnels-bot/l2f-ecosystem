
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "clients": {
                  Row: {
                    "archived_at": string | null,"billing_frequency": string,"business_name": string,"commission_pct": number,"country": string,"created_at": string,"currency": string,"deleted_at": string | null,"deleted_by": string | null,"email": string,"hours_per_month": number,"id": string,"logo_url": string | null,"monthly_retainer": number,"name": string,"niche": string,"notes": string,"owner_id": string,"phone": string,"pricing_amount": number,"pricing_model": string,"pricing_notes": string,"project_end": string | null,"project_start": string | null,"status": string,"tags": (string)[],"updated_at": string,"website": string,"workspace_id": string
                  }
                  Insert: {
                    "archived_at"?: string | null,"billing_frequency"?: string,"business_name"?: string,"commission_pct"?: number,"country"?: string,"created_at"?: string,"currency"?: string,"deleted_at"?: string | null,"deleted_by"?: string | null,"email"?: string,"hours_per_month"?: number,"id"?: string,"logo_url"?: string | null,"monthly_retainer"?: number,"name": string,"niche"?: string,"notes"?: string,"owner_id"?: string,"phone"?: string,"pricing_amount"?: number,"pricing_model"?: string,"pricing_notes"?: string,"project_end"?: string | null,"project_start"?: string | null,"status"?: string,"tags"?: (string)[],"updated_at"?: string,"website"?: string,"workspace_id"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"billing_frequency"?: string,"business_name"?: string,"commission_pct"?: number,"country"?: string,"created_at"?: string,"currency"?: string,"deleted_at"?: string | null,"deleted_by"?: string | null,"email"?: string,"hours_per_month"?: number,"id"?: string,"logo_url"?: string | null,"monthly_retainer"?: number,"name"?: string,"niche"?: string,"notes"?: string,"owner_id"?: string,"phone"?: string,"pricing_amount"?: number,"pricing_model"?: string,"pricing_notes"?: string,"project_end"?: string | null,"project_start"?: string | null,"status"?: string,"tags"?: (string)[],"updated_at"?: string,"website"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "clients_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"funnel_actuals": {
                  Row: {
                    "conversions": number | null,"created_at": string,"funnel_id": string,"id": string,"node_id": string,"owner_id": string,"period_end": string,"period_start": string,"revenue": number | null,"source": string,"source_ref": string | null,"spend": number | null,"updated_at": string,"visitors": number | null,"workspace_id": string
                  }
                  Insert: {
                    "conversions"?: number | null,"created_at"?: string,"funnel_id": string,"id"?: string,"node_id": string,"owner_id"?: string,"period_end": string,"period_start": string,"revenue"?: number | null,"source"?: string,"source_ref"?: string | null,"spend"?: number | null,"updated_at"?: string,"visitors"?: number | null,"workspace_id"?: string
                  }
                  Update: {
                    "conversions"?: number | null,"created_at"?: string,"funnel_id"?: string,"id"?: string,"node_id"?: string,"owner_id"?: string,"period_end"?: string,"period_start"?: string,"revenue"?: number | null,"source"?: string,"source_ref"?: string | null,"spend"?: number | null,"updated_at"?: string,"visitors"?: number | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "funnel_actuals_funnel_id_fkey"
      columns: ["funnel_id"]
isOneToOne: false
      referencedRelation: "funnels"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "funnel_actuals_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"funnel_versions": {
                  Row: {
                    "auto": boolean,"created_at": string,"funnel_id": string,"graph": NonNullable<Json>,"id": string,"label": string,"owner_id": string,"settings": NonNullable<Json>,"workspace_id": string
                  }
                  Insert: {
                    "auto"?: boolean,"created_at"?: string,"funnel_id": string,"graph": NonNullable<Json>,"id"?: string,"label"?: string,"owner_id"?: string,"settings": NonNullable<Json>,"workspace_id"?: string
                  }
                  Update: {
                    "auto"?: boolean,"created_at"?: string,"funnel_id"?: string,"graph"?: NonNullable<Json>,"id"?: string,"label"?: string,"owner_id"?: string,"settings"?: NonNullable<Json>,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "funnel_versions_funnel_id_fkey"
      columns: ["funnel_id"]
isOneToOne: false
      referencedRelation: "funnels"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "funnel_versions_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"funnels": {
                  Row: {
                    "client_id": string,"created_at": string,"deleted_at": string | null,"deleted_by": string | null,"description": string,"graph": NonNullable<Json>,"id": string,"name": string,"owner_id": string,"settings": NonNullable<Json>,"status": string,"summary": NonNullable<Json>,"thumbnail_url": string | null,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "client_id": string,"created_at"?: string,"deleted_at"?: string | null,"deleted_by"?: string | null,"description"?: string,"graph"?: NonNullable<Json>,"id"?: string,"name"?: string,"owner_id"?: string,"settings"?: NonNullable<Json>,"status"?: string,"summary"?: NonNullable<Json>,"thumbnail_url"?: string | null,"updated_at"?: string,"workspace_id"?: string
                  }
                  Update: {
                    "client_id"?: string,"created_at"?: string,"deleted_at"?: string | null,"deleted_by"?: string | null,"description"?: string,"graph"?: NonNullable<Json>,"id"?: string,"name"?: string,"owner_id"?: string,"settings"?: NonNullable<Json>,"status"?: string,"summary"?: NonNullable<Json>,"thumbnail_url"?: string | null,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "funnels_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "funnels_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "client_id": string | null,"created_at": string,"id": string,"name": string,"notes": string,"owner_id": string,"params": NonNullable<Json>,"type": string,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "client_id"?: string | null,"created_at"?: string,"id"?: string,"name": string,"notes"?: string,"owner_id"?: string,"params"?: NonNullable<Json>,"type"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Update: {
                    "client_id"?: string | null,"created_at"?: string,"id"?: string,"name"?: string,"notes"?: string,"owner_id"?: string,"params"?: NonNullable<Json>,"type"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_client_id_fkey"
      columns: ["client_id"]
isOneToOne: false
      referencedRelation: "clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "active": boolean,"agency_logo_url": string | null,"agency_name": string,"created_at": string,"default_currency": string,"email": string,"full_name": string,"id": string,"role": string,"updated_at": string,"workspace_id": string
                  }
                  Insert: {
                    "active"?: boolean,"agency_logo_url"?: string | null,"agency_name"?: string,"created_at"?: string,"default_currency"?: string,"email"?: string,"full_name"?: string,"id": string,"role"?: string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "active"?: boolean,"agency_logo_url"?: string | null,"agency_name"?: string,"created_at"?: string,"default_currency"?: string,"email"?: string,"full_name"?: string,"id"?: string,"role"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"share_comments": {
                  Row: {
                    "author_name": string,"body": string,"created_at": string,"funnel_id": string,"id": string,"node_id": string | null,"owner_id": string,"resolved": boolean,"share_link_id": string,"workspace_id": string
                  }
                  Insert: {
                    "author_name"?: string,"body": string,"created_at"?: string,"funnel_id": string,"id"?: string,"node_id"?: string | null,"owner_id": string,"resolved"?: boolean,"share_link_id": string,"workspace_id"?: string
                  }
                  Update: {
                    "author_name"?: string,"body"?: string,"created_at"?: string,"funnel_id"?: string,"id"?: string,"node_id"?: string | null,"owner_id"?: string,"resolved"?: boolean,"share_link_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "share_comments_funnel_id_fkey"
      columns: ["funnel_id"]
isOneToOne: false
      referencedRelation: "funnels"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "share_comments_share_link_id_fkey"
      columns: ["share_link_id"]
isOneToOne: false
      referencedRelation: "share_links"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "share_comments_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"share_links": {
                  Row: {
                    "allow_comments": boolean,"can_edit": boolean,"created_at": string,"expires_at": string | null,"funnel_id": string,"hide_numbers": boolean,"id": string,"owner_id": string,"token": string,"workspace_id": string
                  }
                  Insert: {
                    "allow_comments"?: boolean,"can_edit"?: boolean,"created_at"?: string,"expires_at"?: string | null,"funnel_id": string,"hide_numbers"?: boolean,"id"?: string,"owner_id"?: string,"token"?: string,"workspace_id"?: string
                  }
                  Update: {
                    "allow_comments"?: boolean,"can_edit"?: boolean,"created_at"?: string,"expires_at"?: string | null,"funnel_id"?: string,"hide_numbers"?: boolean,"id"?: string,"owner_id"?: string,"token"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "share_links_funnel_id_fkey"
      columns: ["funnel_id"]
isOneToOne: false
      referencedRelation: "funnels"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "share_links_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"templates": {
                  Row: {
                    "builtin_key": string | null,"category": string,"created_at": string,"description": string,"graph": NonNullable<Json>,"id": string,"name": string,"owner_id": string | null,"settings": NonNullable<Json>,"workspace_id": string | null
                  }
                  Insert: {
                    "builtin_key"?: string | null,"category"?: string,"created_at"?: string,"description"?: string,"graph": NonNullable<Json>,"id"?: string,"name": string,"owner_id"?: string | null,"settings"?: NonNullable<Json>,"workspace_id"?: string | null
                  }
                  Update: {
                    "builtin_key"?: string | null,"category"?: string,"created_at"?: string,"description"?: string,"graph"?: NonNullable<Json>,"id"?: string,"name"?: string,"owner_id"?: string | null,"settings"?: NonNullable<Json>,"workspace_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "templates_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspace": {
                  Row: {
                    "agency_logo_url": string | null,"agency_name": string,"default_currency": string,"id": number,"updated_at": string
                  }
                  Insert: {
                    "agency_logo_url"?: string | null,"agency_name"?: string,"default_currency"?: string,"id"?: number,"updated_at"?: string
                  }
                  Update: {
                    "agency_logo_url"?: string | null,"agency_name"?: string,"default_currency"?: string,"id"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"workspace_assets": {
                  Row: {
                    "created_at": string,"created_by": string | null,"data": NonNullable<Json>,"id": string,"kind": string,"name": string,"workspace_id": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"data": NonNullable<Json>,"id"?: string,"kind": string,"name": string,"workspace_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"data"?: NonNullable<Json>,"id"?: string,"kind"?: string,"name"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_assets_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspace_members": {
                  Row: {
                    "active": boolean,"created_at": string,"role": string,"user_id": string,"workspace_id": string
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"role"?: string,"user_id": string,"workspace_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"role"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_members_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspace_signups": {
                  Row: {
                    "created_at": string,"email": string,"full_name": string,"join_workspace_id": string | null,"workspace_name": string
                  }
                  Insert: {
                    "created_at"?: string,"email": string,"full_name"?: string,"join_workspace_id"?: string | null,"workspace_name"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"full_name"?: string,"join_workspace_id"?: string | null,"workspace_name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_signups_join_workspace_id_fkey"
      columns: ["join_workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspaces": {
                  Row: {
                    "agency_logo_url": string | null,"agency_name": string,"created_at": string,"default_currency": string,"id": string,"kind": string,"updated_at": string
                  }
                  Insert: {
                    "agency_logo_url"?: string | null,"agency_name"?: string,"created_at"?: string,"default_currency"?: string,"id"?: string,"kind"?: string,"updated_at"?: string
                  }
                  Update: {
                    "agency_logo_url"?: string | null,"agency_name"?: string,"created_at"?: string,"default_currency"?: string,"id"?: string,"kind"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_share_comment":
{ Args: { "p_author": string,"p_body": string,"p_node_id": string,"p_token": string }; Returns: string
                           },
"can_write":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"create_workspace":
{ Args: { "p_name": string }; Returns: string
                           },
"current_workspace_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"get_shared_funnel":
{ Args: { "p_token": string }; Returns: Json
                           },
"is_team_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_team_member":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_workspace_owner":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"my_role":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"my_workspace_ids":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"save_shared_funnel":
{ Args: { "p_graph": Json,"p_settings": Json,"p_token": string }; Returns: boolean
                           },
"share_safe_graph":
{ Args: { "g": Json,"hide_numbers": boolean }; Returns: Json
                           },
"storage_object_in_my_workspace":
{ Args: { "bucket": string,"object_name": string }; Returns: boolean
                           },
"switch_workspace":
{ Args: { "p_workspace": string }; Returns: boolean
                           },
"team_workspace_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"transfer_ownership":
{ Args: { "p_to": string }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
