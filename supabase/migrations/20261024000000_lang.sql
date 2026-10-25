alter table patients add column lang text not null default 'en' check (lang in ('es', 'en'));
alter table contacts add column lang text not null default 'en' check (lang in ('es', 'en'));
