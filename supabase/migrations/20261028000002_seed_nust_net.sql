-- NUST NET (Engineering / Computing) with an FSc-based chapter list.
-- Subject split: Maths 50%, Physics 30%, English 20%. Each chapter starts with an equal share
-- of its subject; weights get refined later from real past papers.
-- Check total_questions / duration / negative marking against NUST's admission page each year.

insert into public.exams (slug, name, total_questions, duration_minutes, marks_per_question, negative_mark)
values ('nust-net-engineering', 'NUST NET (Engineering / Computing)', 200, 180, 1, 0)
on conflict (slug) do nothing;

with exam as (
  select id from public.exams where slug = 'nust-net-engineering'
),
rows (subject, share, chapter, topic, sort) as (
  values
    ('Mathematics', 0.5, 'Number Systems', 'Number Systems', 1),
    ('Mathematics', 0.5, 'Sets, Functions and Groups', 'Sets, Functions and Groups', 2),
    ('Mathematics', 0.5, 'Matrices and Determinants', 'Matrices and Determinants', 3),
    ('Mathematics', 0.5, 'Quadratic Equations', 'Quadratic Equations', 4),
    ('Mathematics', 0.5, 'Partial Fractions', 'Partial Fractions', 5),
    ('Mathematics', 0.5, 'Sequences and Series', 'Sequences and Series', 6),
    ('Mathematics', 0.5, 'Permutations, Combinations and Probability', 'Permutations, Combinations and Probability', 7),
    ('Mathematics', 0.5, 'Mathematical Induction and Binomial Theorem', 'Mathematical Induction and Binomial Theorem', 8),
    ('Mathematics', 0.5, 'Fundamentals of Trigonometry', 'Fundamentals of Trigonometry', 9),
    ('Mathematics', 0.5, 'Trigonometric Identities', 'Trigonometric Identities', 10),
    ('Mathematics', 0.5, 'Trigonometric Functions and Graphs', 'Trigonometric Functions and Graphs', 11),
    ('Mathematics', 0.5, 'Application of Trigonometry', 'Application of Trigonometry', 12),
    ('Mathematics', 0.5, 'Inverse Trigonometric Functions', 'Inverse Trigonometric Functions', 13),
    ('Mathematics', 0.5, 'Trigonometric Equations', 'Trigonometric Equations', 14),
    ('Mathematics', 0.5, 'Functions and Limits', 'Functions and Limits', 15),
    ('Mathematics', 0.5, 'Differentiation', 'Differentiation', 16),
    ('Mathematics', 0.5, 'Integration', 'Integration', 17),
    ('Mathematics', 0.5, 'Analytic Geometry (Lines)', 'Analytic Geometry (Lines)', 18),
    ('Mathematics', 0.5, 'Linear Inequalities and Linear Programming', 'Linear Inequalities and Linear Programming', 19),
    ('Mathematics', 0.5, 'Conic Sections', 'Conic Sections', 20),
    ('Mathematics', 0.5, 'Vectors', 'Vectors', 21),
    ('Physics', 0.3, 'Measurements', 'Measurements', 1),
    ('Physics', 0.3, 'Vectors and Equilibrium', 'Vectors and Equilibrium', 2),
    ('Physics', 0.3, 'Motion and Force', 'Motion and Force', 3),
    ('Physics', 0.3, 'Work and Energy', 'Work and Energy', 4),
    ('Physics', 0.3, 'Circular and Rotational Motion', 'Circular and Rotational Motion', 5),
    ('Physics', 0.3, 'Fluid Dynamics', 'Fluid Dynamics', 6),
    ('Physics', 0.3, 'Oscillations', 'Oscillations', 7),
    ('Physics', 0.3, 'Waves', 'Waves', 8),
    ('Physics', 0.3, 'Physical Optics', 'Physical Optics', 9),
    ('Physics', 0.3, 'Optical Instruments', 'Optical Instruments', 10),
    ('Physics', 0.3, 'Heat and Thermodynamics', 'Heat and Thermodynamics', 11),
    ('Physics', 0.3, 'Electrostatics', 'Electrostatics', 12),
    ('Physics', 0.3, 'Current Electricity', 'Current Electricity', 13),
    ('Physics', 0.3, 'Electromagnetism', 'Electromagnetism', 14),
    ('Physics', 0.3, 'Electromagnetic Induction', 'Electromagnetic Induction', 15),
    ('Physics', 0.3, 'Alternating Current', 'Alternating Current', 16),
    ('Physics', 0.3, 'Physics of Solids', 'Physics of Solids', 17),
    ('Physics', 0.3, 'Electronics', 'Electronics', 18),
    ('Physics', 0.3, 'Dawn of Modern Physics', 'Dawn of Modern Physics', 19),
    ('Physics', 0.3, 'Atomic Spectra', 'Atomic Spectra', 20),
    ('Physics', 0.3, 'Nuclear Physics', 'Nuclear Physics', 21),
    ('English', 0.2, 'Vocabulary', 'Synonyms', 1),
    ('English', 0.2, 'Vocabulary', 'Antonyms', 2),
    ('English', 0.2, 'Vocabulary', 'Analogies', 3),
    ('English', 0.2, 'Grammar', 'Sentence Completion', 4),
    ('English', 0.2, 'Grammar', 'Error Identification', 5),
    ('English', 0.2, 'Reading', 'Comprehension', 6)
)
insert into public.topics (exam_id, subject, chapter, topic, weight, sort)
select exam.id, r.subject, r.chapter, r.topic,
       round(r.share / count(*) over (partition by r.subject), 4),
       r.sort
from rows r cross join exam
on conflict (exam_id, subject, chapter, topic) do nothing;
