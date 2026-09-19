export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      comments: {
        Row: {
          author_id: string | null;
          author_kind: string;
          body: string;
          created_at: string;
          deleted_at: string | null;
          guest_name: string | null;
          id: string;
          parent_id: string | null;
          post_id: string;
          request_actor_hash: string;
          request_hash: string;
          request_key: string;
          status: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          author_id?: string | null;
          author_kind: string;
          body: string;
          created_at?: string;
          deleted_at?: string | null;
          guest_name?: string | null;
          id?: string;
          parent_id?: string | null;
          post_id: string;
          request_actor_hash: string;
          request_hash: string;
          request_key: string;
          status?: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          author_id?: string | null;
          author_kind?: string;
          body?: string;
          created_at?: string;
          deleted_at?: string | null;
          guest_name?: string | null;
          id?: string;
          parent_id?: string | null;
          post_id?: string;
          request_actor_hash?: string;
          request_hash?: string;
          request_key?: string;
          status?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "comments_post_id_parent_id_fkey";
            columns: ["post_id", "parent_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["post_id", "id"];
          },
        ];
      };
      post_publications: {
        Row: {
          body_html: string | null;
          category_code: string;
          comments_enabled: boolean;
          cover_asset_id: string | null;
          metadata: Json;
          pdf_asset_id: string | null;
          post_id: string;
          published_at: string;
          revision_id: string;
          site_id: string;
          slug: string;
          tags: string[];
          title: string;
          updated_at: string;
          withdrawn_at: string | null;
        };
        Insert: {
          body_html?: string | null;
          category_code: string;
          comments_enabled?: boolean;
          cover_asset_id?: string | null;
          metadata?: Json;
          pdf_asset_id?: string | null;
          post_id: string;
          published_at: string;
          revision_id: string;
          site_id: string;
          slug: string;
          tags?: string[];
          title: string;
          updated_at?: string;
          withdrawn_at?: string | null;
        };
        Update: {
          body_html?: string | null;
          category_code?: string;
          comments_enabled?: boolean;
          cover_asset_id?: string | null;
          metadata?: Json;
          pdf_asset_id?: string | null;
          post_id?: string;
          published_at?: string;
          revision_id?: string;
          site_id?: string;
          slug?: string;
          tags?: string[];
          title?: string;
          updated_at?: string;
          withdrawn_at?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_asset_id: string | null;
          display_name: string;
          user_id: string;
        };
        Insert: {
          avatar_asset_id?: string | null;
          display_name: string;
          user_id: string;
        };
        Update: {
          avatar_asset_id?: string | null;
          display_name?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      publication_assets: {
        Row: {
          alt: string | null;
          asset_id: string;
          caption: string | null;
          post_id: string;
          purpose: string;
        };
        Insert: {
          alt?: string | null;
          asset_id: string;
          caption?: string | null;
          post_id: string;
          purpose: string;
        };
        Update: {
          alt?: string | null;
          asset_id?: string;
          caption?: string | null;
          post_id?: string;
          purpose?: string;
        };
        Relationships: [
          {
            foreignKeyName: "publication_assets_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "post_publications";
            referencedColumns: ["post_id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      travel_api: {
        Args: { p_action: string; p_actor?: string; p_input?: Json };
        Returns: Json;
      };
      travel_worker: {
        Args: { p_action: string; p_input?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema =
  DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  } ? keyof (
      & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]][
        "Tables"
      ]
      & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]][
        "Views"
      ]
    )
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
} ? (
    & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]][
      "Tables"
    ]
    & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]][
      "Views"
    ]
  )[TableName] extends {
    Row: infer R;
  } ? R
  : never
  : DefaultSchemaTableNameOrOptions extends keyof (
    & DefaultSchema["Tables"]
    & DefaultSchema["Views"]
  ) ? (
      & DefaultSchema["Tables"]
      & DefaultSchema["Views"]
    )[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R;
    } ? R
    : never
  : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  } ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]][
      "Tables"
    ]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
} ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]][
    "Tables"
  ][TableName] extends {
    Insert: infer I;
  } ? I
  : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I;
    } ? I
    : never
  : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  } ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]][
      "Tables"
    ]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
} ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]][
    "Tables"
  ][TableName] extends {
    Update: infer U;
  } ? U
  : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U;
    } ? U
    : never
  : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  } ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]][
      "Enums"
    ]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
} ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][
    EnumName
  ]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  } ? keyof DatabaseWithoutInternals[
      PublicCompositeTypeNameOrOptions["schema"]
    ]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
} ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]][
    "CompositeTypes"
  ][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
