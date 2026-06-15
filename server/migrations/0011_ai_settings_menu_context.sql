alter table ai_settings
  add column if not exists behavior_instructions text not null default 'Seja simpatica, responda sempre em portugues e ajude o cliente a fazer o pedido.',
  add column if not exists menu_text text not null default '',
  add column if not exists menu_pdf_name text not null default '',
  add column if not exists menu_pdf_data text;
