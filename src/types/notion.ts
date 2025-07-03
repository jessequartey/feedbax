/**
 * Notion API types and interfaces
 * Types specific to Notion integration and API responses
 */

// Notion API base types
export interface NotionPage {
  object: "page";
  id: string;
  created_time: string;
  last_edited_time: string;
  created_by: NotionUser;
  last_edited_by: NotionUser;
  cover?: NotionFile;
  icon?: NotionIcon;
  parent: NotionParent;
  archived: boolean;
  properties: Record<string, NotionProperty>;
  url: string;
  public_url?: string;
}

export interface NotionDatabase {
  object: "database";
  id: string;
  created_time: string;
  last_edited_time: string;
  created_by: NotionUser;
  last_edited_by: NotionUser;
  title: NotionRichText[];
  description: NotionRichText[];
  icon?: NotionIcon;
  cover?: NotionFile;
  properties: Record<string, NotionPropertyDefinition>;
  parent: NotionParent;
  url: string;
  archived: boolean;
  is_inline: boolean;
  public_url?: string;
}

export interface NotionUser {
  object: "user";
  id: string;
  type?: "person" | "bot";
  name?: string;
  avatar_url?: string;
  person?: {
    email?: string;
  };
  bot?: {
    owner: {
      type: "workspace" | "user";
      workspace?: boolean;
      user?: NotionUser;
    };
    workspace_name?: string;
  };
}

// Property types
export type NotionProperty =
  | NotionTitleProperty
  | NotionRichTextProperty
  | NotionNumberProperty
  | NotionSelectProperty
  | NotionMultiSelectProperty
  | NotionDateProperty
  | NotionPeopleProperty
  | NotionFilesProperty
  | NotionCheckboxProperty
  | NotionUrlProperty
  | NotionEmailProperty
  | NotionPhoneNumberProperty
  | NotionFormulaProperty
  | NotionRelationProperty
  | NotionRollupProperty
  | NotionCreatedTimeProperty
  | NotionCreatedByProperty
  | NotionLastEditedTimeProperty
  | NotionLastEditedByProperty;

export interface NotionTitleProperty {
  id: string;
  type: "title";
  title: NotionRichText[];
}

export interface NotionRichTextProperty {
  id: string;
  type: "rich_text";
  rich_text: NotionRichText[];
}

export interface NotionNumberProperty {
  id: string;
  type: "number";
  number: number | null;
}

export interface NotionSelectProperty {
  id: string;
  type: "select";
  select: NotionSelectOption | null;
}

export interface NotionMultiSelectProperty {
  id: string;
  type: "multi_select";
  multi_select: NotionSelectOption[];
}

export interface NotionDateProperty {
  id: string;
  type: "date";
  date: NotionDateObject | null;
}

export interface NotionPeopleProperty {
  id: string;
  type: "people";
  people: NotionUser[];
}

export interface NotionFilesProperty {
  id: string;
  type: "files";
  files: NotionFile[];
}

export interface NotionCheckboxProperty {
  id: string;
  type: "checkbox";
  checkbox: boolean;
}

export interface NotionUrlProperty {
  id: string;
  type: "url";
  url: string | null;
}

export interface NotionEmailProperty {
  id: string;
  type: "email";
  email: string | null;
}

export interface NotionPhoneNumberProperty {
  id: string;
  type: "phone_number";
  phone_number: string | null;
}

export interface NotionFormulaProperty {
  id: string;
  type: "formula";
  formula: {
    type: "string" | "number" | "boolean" | "date";
    string?: string;
    number?: number;
    boolean?: boolean;
    date?: NotionDateObject;
  };
}

export interface NotionRelationProperty {
  id: string;
  type: "relation";
  relation: Array<{ id: string }>;
  has_more?: boolean;
}

export interface NotionRollupProperty {
  id: string;
  type: "rollup";
  rollup: {
    type: "number" | "date" | "array" | "unsupported";
    number?: number;
    date?: NotionDateObject;
    array?: NotionProperty[];
    function: "count" | "count_values" | "empty" | "not_empty" | "unique" | "show_original" | "percent_empty" | "percent_not_empty" | "sum" | "average" | "median" | "min" | "max" | "range" | "earliest_date" | "latest_date" | "date_range" | "checked" | "unchecked" | "percent_checked" | "percent_unchecked" | "count_per_group" | "percent_per_group" | "show_unique";
  };
}

export interface NotionCreatedTimeProperty {
  id: string;
  type: "created_time";
  created_time: string;
}

export interface NotionCreatedByProperty {
  id: string;
  type: "created_by";
  created_by: NotionUser;
}

export interface NotionLastEditedTimeProperty {
  id: string;
  type: "last_edited_time";
  last_edited_time: string;
}

export interface NotionLastEditedByProperty {
  id: string;
  type: "last_edited_by";
  last_edited_by: NotionUser;
}

// Property definition types (for database schema)
export type NotionPropertyDefinition =
  | { type: "title"; title: object }
  | { type: "rich_text"; rich_text: object }
  | { type: "number"; number: { format?: "number" | "number_with_commas" | "percent" | "dollar" | "canadian_dollar" | "euro" | "pound" | "yen" | "ruble" | "rupee" | "won" | "yuan" | "real" | "lira" | "rupiah" | "franc" | "hong_kong_dollar" | "new_zealand_dollar" | "krona" | "norwegian_krone" | "mexican_peso" | "rand" | "new_taiwan_dollar" | "danish_krone" | "zloty" | "baht" | "forint" | "koruna" | "shekel" | "chilean_peso" | "philippine_peso" | "dirham" | "colombian_peso" | "riyal" | "ringgit" | "leu" | "argentine_peso" | "uruguayan_peso" } }
  | { type: "select"; select: { options: NotionSelectOption[] } }
  | { type: "multi_select"; multi_select: { options: NotionSelectOption[] } }
  | { type: "date"; date: object }
  | { type: "people"; people: object }
  | { type: "files"; files: object }
  | { type: "checkbox"; checkbox: object }
  | { type: "url"; url: object }
  | { type: "email"; email: object }
  | { type: "phone_number"; phone_number: object }
  | { type: "formula"; formula: { expression: string } }
  | { type: "relation"; relation: { database_id: string; type?: "single_property" | "dual_property"; single_property?: object; dual_property?: { synced_property_name: string; synced_property_id: string } } }
  | { type: "rollup"; rollup: { relation_property_name: string; relation_property_id: string; rollup_property_name: string; rollup_property_id: string; function: string } }
  | { type: "created_time"; created_time: object }
  | { type: "created_by"; created_by: object }
  | { type: "last_edited_time"; last_edited_time: object }
  | { type: "last_edited_by"; last_edited_by: object };

// Supporting types
export interface NotionRichText {
  type: "text" | "mention" | "equation";
  text?: {
    content: string;
    link?: { url: string } | null;
  };
  mention?: {
    type: "user" | "page" | "database" | "date" | "link_preview" | "template_mention";
    user?: NotionUser;
    page?: { id: string };
    database?: { id: string };
    date?: NotionDateObject;
    link_preview?: { url: string };
    template_mention?: {
      type: "template_mention_date" | "template_mention_user";
      template_mention_date?: "today" | "now";
      template_mention_user?: "me";
    };
  };
  equation?: {
    expression: string;
  };
  annotations: {
    bold: boolean;
    italic: boolean;
    strikethrough: boolean;
    underline: boolean;
    code: boolean;
    color: "default" | "gray" | "brown" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink" | "red" | "gray_background" | "brown_background" | "orange_background" | "yellow_background" | "green_background" | "blue_background" | "purple_background" | "pink_background" | "red_background";
  };
  plain_text: string;
  href?: string | null;
}

export interface NotionSelectOption {
  id: string;
  name: string;
  color: "default" | "gray" | "brown" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink" | "red";
}

export interface NotionDateObject {
  start: string;
  end?: string | null;
  time_zone?: string | null;
}

export interface NotionFile {
  type: "external" | "file";
  external?: {
    url: string;
  };
  file?: {
    url: string;
    expiry_time: string;
  };
  name?: string;
}

export interface NotionIcon {
  type: "emoji" | "external" | "file";
  emoji?: string;
  external?: {
    url: string;
  };
  file?: {
    url: string;
    expiry_time: string;
  };
}

export interface NotionParent {
  type: "database_id" | "page_id" | "workspace" | "block_id";
  database_id?: string;
  page_id?: string;
  workspace?: boolean;
  block_id?: string;
}

// API response types
export interface NotionListResponse<T> {
  object: "list";
  results: T[];
  next_cursor?: string | null;
  has_more: boolean;
  type?: string;
  page_or_database?: object;
  developer_survey?: string;
  request_id: string;
}

export interface NotionQueryDatabaseResponse {
  object: "list";
  results: NotionPage[];
  next_cursor?: string | null;
  has_more: boolean;
  type: "page_or_database";
  page_or_database: object;
  request_id: string;
}

// Error types
export interface NotionError {
  object: "error";
  status: number;
  code: string;
  message: string;
  developer_survey?: string;
  request_id: string;
}

// Filter and sort types for Notion queries
export interface NotionFilter {
  property: string;
  title?: { equals?: string; is_empty?: boolean; is_not_empty?: boolean; starts_with?: string; ends_with?: string; contains?: string; does_not_contain?: string; does_not_equal?: string };
  rich_text?: { equals?: string; is_empty?: boolean; is_not_empty?: boolean; starts_with?: string; ends_with?: string; contains?: string; does_not_contain?: string; does_not_equal?: string };
  number?: { equals?: number; does_not_equal?: number; greater_than?: number; less_than?: number; greater_than_or_equal_to?: number; less_than_or_equal_to?: number; is_empty?: boolean; is_not_empty?: boolean };
  checkbox?: { equals?: boolean; does_not_equal?: boolean };
  select?: { equals?: string; does_not_equal?: string; is_empty?: boolean; is_not_empty?: boolean };
  multi_select?: { contains?: string; does_not_contain?: string; is_empty?: boolean; is_not_empty?: boolean };
  date?: { equals?: string; before?: string; after?: string; on_or_before?: string; on_or_after?: string; past_week?: object; past_month?: object; past_year?: object; next_week?: object; next_month?: object; next_year?: object; is_empty?: boolean; is_not_empty?: boolean };
  people?: { contains?: string; does_not_contain?: string; is_empty?: boolean; is_not_empty?: boolean };
  files?: { is_empty?: boolean; is_not_empty?: boolean };
  relation?: { contains?: string; does_not_contain?: string; is_empty?: boolean; is_not_empty?: boolean };
  formula?: { string?: { equals?: string; is_empty?: boolean; is_not_empty?: boolean; starts_with?: string; ends_with?: string; contains?: string; does_not_contain?: string; does_not_equal?: string }; checkbox?: { equals?: boolean; does_not_equal?: boolean }; number?: { equals?: number; does_not_equal?: number; greater_than?: number; less_than?: number; greater_than_or_equal_to?: number; less_than_or_equal_to?: number; is_empty?: boolean; is_not_empty?: boolean }; date?: { equals?: string; before?: string; after?: string; on_or_before?: string; on_or_after?: string; past_week?: object; past_month?: object; past_year?: object; next_week?: object; next_month?: object; next_year?: object; is_empty?: boolean; is_not_empty?: boolean } };
}

export interface NotionCompoundFilter {
  and?: NotionFilter[];
  or?: NotionFilter[];
}

export interface NotionSort {
  property?: string;
  timestamp?: "created_time" | "last_edited_time";
  direction: "ascending" | "descending";
}

export interface NotionQueryDatabaseParams {
  database_id: string;
  filter?: NotionFilter | NotionCompoundFilter;
  sorts?: NotionSort[];
  start_cursor?: string;
  page_size?: number;
}
