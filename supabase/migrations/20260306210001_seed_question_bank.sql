-- Phase 3: development seed data (fake HMGS-style samples)

begin;

insert into public.subjects (id, name, slug, sort_order) values
  ('a1000000-0000-4000-8000-000000000001', 'Anayasa Hukuku', 'anayasa-hukuku', 1),
  ('a1000000-0000-4000-8000-000000000002', 'Ceza Hukuku', 'ceza-hukuku', 2);

insert into public.topics (id, subject_id, name, slug, sort_order) values
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Temel Haklar', 'temel-haklar', 1),
  ('b1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'Yasama', 'yasama', 2),
  ('b1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000002', 'Suç ve Ceza', 'suc-ve-ceza', 1),
  ('b1000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000002', 'Türk Ceza Kanunu Genel Hükümler', 'tck-genel-hukumler', 2);

insert into public.questions (id, subject_id, topic_id, question_text, explanation, difficulty) values
  (
    'c1000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
    '1982 Anayasası''na göre, aşağıdakilerden hangisi temel hak ve hürriyetlerin sınırlandırılmasında aranan genel şartlardan biridir?',
    'Temel hakların sınırlandırılması demokratik toplum düzeninin gereklerine uygun olmalıdır.',
    'easy'
  ),
  (
    'c1000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000002',
    'TBMM''nin kanun teklif etme yetkisi kimdedir?',
    'Kanun teklif etme yetkisi milletvekilleri ve Cumhurbaşkanına aittir.',
    'medium'
  ),
  (
    'c1000000-0000-4000-8000-000000000003',
    'a1000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000003',
    'TCK''da suçun maddi unsurları arasında aşağıdakilerden hangisi yer almaz?',
    'Kusurluluk suçun manevi unsurudur; maddi unsur değildir.',
    'medium'
  ),
  (
    'c1000000-0000-4000-8000-000000000004',
    'a1000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000004',
    'Ceza kanununun zaman bakımından uygulanması ile ilgili aşağıdaki ifadelerden hangisi doğrudur?',
    'Lehe olan hüküm, kesinleşmiş hüküm söz konusu olsa bile uygulanabilir.',
    'hard'
  );

-- question 1 options
insert into public.question_options (question_id, option_key, option_text, is_correct, sort_order) values
  ('c1000000-0000-4000-8000-000000000001', 'A', 'Kanunilik ilkesine aykırı olabilir.', false, 1),
  ('c1000000-0000-4000-8000-000000000001', 'B', 'Demokratik toplum düzeninin gereklerine uygun olmalıdır.', true, 2),
  ('c1000000-0000-4000-8000-000000000001', 'C', 'Yalnızca olağanüstü hallerde uygulanabilir.', false, 3),
  ('c1000000-0000-4000-8000-000000000001', 'D', 'Anayasa Mahkemesi iznine tabidir.', false, 4),
  ('c1000000-0000-4000-8000-000000000001', 'E', 'Cumhurbaşkanlığı kararnamesi ile düzenlenir.', false, 5);

-- question 2 options
insert into public.question_options (question_id, option_key, option_text, is_correct, sort_order) values
  ('c1000000-0000-4000-8000-000000000002', 'A', 'Yalnızca Bakanlar Kurulu', false, 1),
  ('c1000000-0000-4000-8000-000000000002', 'B', 'Yalnızca milletvekilleri', false, 2),
  ('c1000000-0000-4000-8000-000000000002', 'C', 'Milletvekilleri ve Cumhurbaşkanı', true, 3),
  ('c1000000-0000-4000-8000-000000000002', 'D', 'Yalnızca Cumhurbaşkanı', false, 4),
  ('c1000000-0000-4000-8000-000000000002', 'E', 'Anayasa Mahkemesi', false, 5);

-- question 3 options
insert into public.question_options (question_id, option_key, option_text, is_correct, sort_order) values
  ('c1000000-0000-4000-8000-000000000003', 'A', 'Fail', false, 1),
  ('c1000000-0000-4000-8000-000000000003', 'B', 'Fiil', false, 2),
  ('c1000000-0000-4000-8000-000000000003', 'C', 'Netice', false, 3),
  ('c1000000-0000-4000-8000-000000000003', 'D', 'Kusurluluk', true, 4),
  ('c1000000-0000-4000-8000-000000000003', 'E', 'Mağdur', false, 5);

-- question 4 options
insert into public.question_options (question_id, option_key, option_text, is_correct, sort_order) values
  ('c1000000-0000-4000-8000-000000000004', 'A', 'Kesinleşmiş hüküm lehe değişiklikten yararlanamaz.', false, 1),
  ('c1000000-0000-4000-8000-000000000004', 'B', 'Lehe olan hüküm kesinleşmiş hükümlere de uygulanır.', true, 2),
  ('c1000000-0000-4000-8000-000000000004', 'C', 'Geçmişe yürüyen kanunlar her zaman uygulanır.', false, 3),
  ('c1000000-0000-4000-8000-000000000004', 'D', 'Ceza kanunları yalnızca katalog suçlarda uygulanır.', false, 4),
  ('c1000000-0000-4000-8000-000000000004', 'E', 'Zamanaşımı hükümleri uygulanmaz.', false, 5);

commit;
