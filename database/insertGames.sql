-- ==========================================
-- Insertar todos los juegos de Scrollinn
-- ON CONFLICT → se puede re-ejecutar sin duplicados
-- ==========================================
INSERT INTO games (id, name, is_lower_better) VALUES
  ('tower-blocks',  'Tower Blocks',   false),
  ('odd-one-out',   'Odd One Out',    false),
  ('circle-ninja',  'Circle Ninja',   false),
  ('color-match',   'Color Match',    true),
  ('circle-path',   'Circle Path',    false),
  ('hextris',       'Hextris',        false),
  ('neon-tap',      'Neon Tap',       false),
  ('stroop-effect', 'Stroop Effect',  false),
  ('timer',         'Timer',          true),
  ('traffic-light', 'Traffic Light',  true),
  ('sweet-spot',    'Sweet Spot',     false),
  ('dodge-rush',    'Dodge Rush',     false),
  ('frenzy-tap',    'Frenzy Tap',     false),
  ('perfect-scale', 'Perfect Scale',  true),
  ('swipe-sorter',  'Swipe Sorter',   false),
  ('math-rush',     'Math Rush',      false),
  ('stick-bridge',  'Stick Bridge',   false),
  ('drop-the-box',  'Drop the Box',   false),
  ('vector-leap',   'Vector Leap',    false),
  ('rps-duel',      'RPS Duel',       false),
  ('orbit-sniper',   'Orbit Sniper',   false),
  ('shadow-dash',    'Shadow Dash',    false),
  ('gravity-draw',   'Gravity Draw',   false),
  ('crossroad-dart', 'Crossroad Dart',  false),
  ('mental-math',    'Mental Math',    false),
  ('perfect-circle', 'Perfect Circle', false),
  ('higer-lower', 'Higher or Lower', false),
  ('memory-loop', 'Memory Loop', false),
  ('overheat', 'Overheat', false),
  ('memory-sequence', 'Memory Sequence', false)

ON CONFLICT (id) DO UPDATE SET
  name            = EXCLUDED.name,
  is_lower_better = EXCLUDED.is_lower_better;
