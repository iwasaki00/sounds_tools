(() => {
  const sound = (label, file) => [label, file];
  const one = (label, file) => [sound(label, file)];
  const track = (id, name, icon, sounds, pattern, role, volume = 0.72) => ({
    id,
    name,
    icon,
    sounds,
    pattern,
    role,
    volume,
  });
  const bank = (id, label, tracks) => ({ id, label, tracks });

  const quarter = [0, 4, 8, 12];
  const backbeat = [4, 12];
  const offbeat = [2, 6, 10, 14];
  const eighths = [0, 2, 4, 6, 8, 10, 12, 14];
  const sixteenths = Array.from({ length: 16 }, (_, index) => index);

  const kickOptions = [
    sound("Deep", "seq_kick_deep.wav"),
    sound("Tight", "seq_kick_tight.wav"),
    sound("Soft", "seq_kick_soft.wav"),
  ];
  const snareOptions = [
    sound("Crisp", "seq_snare_crisp.wav"),
    sound("Soft", "seq_snare_soft.wav"),
    sound("Noise", "seq_snare_noise.wav"),
  ];
  const closedHatOptions = [
    sound("Closed", "seq_hat_closed.wav"),
    sound("Tick", "seq_hat_tick.wav"),
  ];
  const openHatOptions = [sound("Open", "seq_hat_open.wav")];
  const clapOptions = [sound("Clap", "seq_clap.wav")];

  window.SEQUENCER_GENRES = {
    original: {
      name: "Original",
      bpm: { min: 70, max: 170, default: 120 },
      swing: 0.5,
      banks: [
        bank("all", "ALL", [
          track("kick", "Kick", "kick", kickOptions, quarter, "kick", 0.78),
          track("snare", "Snare", "snare", snareOptions, backbeat, "snare", 0.78),
          track("hat", "Hat", "hat", [
            ...closedHatOptions,
            ...openHatOptions,
          ], offbeat, "hat", 0.72),
          track("perc", "Perc", "perc", [
            sound("Clap", "seq_clap.wav"),
            sound("Tom Low", "seq_tom_low.wav"),
            sound("Tom Mid", "seq_tom_mid.wav"),
          ], [7, 15], "perc", 0.74),
          track("bass", "Bass", "bass", [
            sound("Bass C", "seq_synth_bass_c.wav"),
            sound("Bass G", "seq_synth_bass_g.wav"),
            sound("Drop", "seq_synth_drop.wav"),
          ], [0, 6, 8, 14], "bass", 0.76),
          track("synth", "Synth", "synth", [
            sound("Pluck C", "seq_synth_pluck_c.wav"),
            sound("Pluck E", "seq_synth_pluck_e.wav"),
            sound("Pluck G", "seq_synth_pluck_g.wav"),
            sound("C Maj", "seq_synth_stab_cmaj.wav"),
            sound("A Min", "seq_synth_stab_amin.wav"),
            sound("Rise", "seq_synth_rise.wav"),
          ], [3, 11], "lead", 0.72),
        ]),
      ],
    },

    techno: {
      name: "Techno / テクノ",
      bpm: { min: 125, max: 140, default: 132 },
      swing: 0.5,
      banks: [
        bank("drums", "DRUMS", [
          track("techno-kick", "Kick", "kick", kickOptions, quarter, "kick", 0.78),
          track("techno-clap", "Clap", "snare", clapOptions, backbeat, "clap", 0.72),
          track("techno-closed-hat", "Closed Hat", "hat", closedHatOptions, eighths, "hat", 0.66),
          track("techno-open-hat", "Open Hat", "hat", openHatOptions, offbeat, "openhat", 0.64),
          track("techno-ride", "Ride", "hat", one("Ride", "genre_ride.wav"), quarter, "ride", 0.62),
          track("techno-rim", "Rim Shot", "snare", one("Rim Shot", "genre_rim_shot.wav"), [3, 11], "perc", 0.68),
        ]),
        bank("bass", "BASS", [
          track("techno-analog-bass", "Analog Bass", "bass", one("Analog Bass", "genre_analog_bass.wav"), [0, 3, 6, 8, 11, 14], "bass", 0.72),
          track("techno-acid-bass", "Acid Bass", "bass", one("Acid Bass", "genre_acid_bass.wav"), [0, 2, 3, 6, 8, 10, 11, 14], "bass", 0.68),
          track("techno-sub-bass", "Sub Bass", "bass", one("Sub Bass", "genre_sub_bass.wav"), [0, 8], "bass", 0.74),
        ]),
        bank("synth", "SYNTH", [
          track("techno-saw-lead", "Saw Lead", "synth", one("Saw Lead", "genre_saw_lead.wav"), [0, 6, 10, 14], "lead", 0.62),
          track("techno-square-lead", "Square Lead", "synth", one("Square Lead", "genre_square_lead.wav"), [3, 11], "lead", 0.60),
          track("techno-pluck", "Pluck", "synth", one("Pluck", "seq_synth_pluck_c.wav"), offbeat, "lead", 0.64),
          track("techno-pad", "Pad", "synth", one("Pad", "genre_pad.wav"), [0, 8], "pad", 0.52),
          track("techno-chord", "Synth Chord", "synth", one("Synth Chord", "seq_synth_stab_cmaj.wav"), [0, 8], "chord", 0.58),
        ]),
        bank("fx", "FX", [
          track("techno-white-noise", "White Noise", "fx", one("White Noise", "genre_white_noise.wav"), offbeat, "fx", 0.42),
          track("techno-sweep-up", "Sweep Up", "fx", one("Sweep Up", "genre_filter_sweep_up.wav"), [12], "fx", 0.52),
          track("techno-sweep-down", "Sweep Down", "fx", one("Sweep Down", "genre_filter_sweep_down.wav"), [0], "fx", 0.50),
          track("techno-reverse-cymbal", "Reverse Cymbal", "fx", one("Reverse Cymbal", "genre_reverse_cymbal.wav"), [15], "fx", 0.54),
          track("techno-impact", "Impact", "fx", one("Impact", "genre_impact.wav"), [0], "fx", 0.62),
          track("techno-vinyl-noise", "Vinyl Noise", "fx", one("Vinyl Noise", "genre_vinyl_noise.wav"), quarter, "texture", 0.28),
        ]),
      ],
    },

    house: {
      name: "House / ハウス",
      bpm: { min: 120, max: 128, default: 124 },
      swing: 0.52,
      banks: [
        bank("drums", "DRUMS", [
          track("house-kick", "Kick", "kick", kickOptions, quarter, "kick", 0.76),
          track("house-clap", "Clap", "snare", clapOptions, backbeat, "clap", 0.72),
          track("house-closed-hat", "Closed Hat", "hat", closedHatOptions, eighths, "hat", 0.64),
          track("house-open-hat", "Open Hat", "hat", openHatOptions, offbeat, "openhat", 0.62),
          track("house-ride", "Ride", "hat", one("Ride", "genre_ride.wav"), quarter, "ride", 0.58),
          track("house-tambourine", "Tambourine", "perc", one("Tambourine", "genre_tambourine.wav"), offbeat, "hat", 0.58),
        ]),
        bank("bass", "BASS", [
          track("house-deep-bass", "Deep Bass", "bass", one("Deep Bass", "genre_deep_bass.wav"), [0, 3, 6, 10, 14], "bass", 0.72),
          track("house-finger-bass", "Finger Bass", "bass", one("Finger Bass", "genre_finger_bass.wav"), [0, 3, 7, 10, 14], "bass", 0.66),
          track("house-synth-bass", "Synth Bass", "bass", one("Synth Bass", "seq_synth_bass_c.wav"), [0, 6, 8, 14], "bass", 0.68),
        ]),
        bank("synth", "SYNTH", [
          track("house-piano", "Piano", "piano", one("Piano", "genre_piano.wav"), [0, 3, 6, 10, 14], "chord", 0.62),
          track("house-electric-piano", "Electric Piano", "piano", one("Electric Piano", "genre_electric_piano.wav"), [2, 6, 10, 14], "chord", 0.58),
          track("house-organ", "Organ", "piano", one("Organ", "genre_organ.wav"), [0, 8], "chord", 0.54),
          track("house-strings", "Strings", "synth", one("Strings", "genre_strings.wav"), [0, 8], "pad", 0.48),
          track("house-pad", "Pad", "synth", one("Pad", "genre_pad.wav"), [0, 8], "pad", 0.48),
        ]),
        bank("fx", "FX", [
          track("house-vocal-chop", "Vocal Chop", "fx", one("Vocal Chop", "genre_vocal_chop.wav"), [3, 7, 11, 15], "fx", 0.54),
          track("house-yeah", "Yeah!", "fx", one("Yeah!", "genre_voice_yeah.wav"), [12], "fx", 0.50),
          track("house-come-on", "Come On!", "fx", one("Come On!", "genre_voice_come_on.wav"), [14], "fx", 0.50),
          track("house-reverse-cymbal", "Reverse Cymbal", "fx", one("Reverse Cymbal", "genre_reverse_cymbal.wav"), [15], "fx", 0.52),
          track("house-crash", "Crash", "fx", one("Crash", "genre_crash.wav"), [0], "fx", 0.58),
          track("house-noise-sweep", "Noise Sweep", "fx", one("Noise Sweep", "genre_noise_sweep.wav"), [12], "fx", 0.48),
        ]),
      ],
    },

    eurobeat: {
      name: "Eurobeat / ユーロビート",
      bpm: { min: 145, max: 160, default: 152 },
      swing: 0.5,
      banks: [
        bank("drums", "DRUMS", [
          track("euro-kick", "Kick", "kick", kickOptions, quarter, "kick", 0.78),
          track("euro-snare", "Snare", "snare", snareOptions, backbeat, "snare", 0.72),
          track("euro-closed-hat", "Closed Hat", "hat", closedHatOptions, eighths, "hat", 0.62),
          track("euro-open-hat", "Open Hat", "hat", openHatOptions, offbeat, "openhat", 0.60),
          track("euro-crash", "Crash", "hat", one("Crash", "genre_crash.wav"), [0], "fx", 0.56),
        ]),
        bank("bass", "BASS", [
          track("euro-driving-bass", "Driving Bass", "bass", one("Driving Bass", "genre_driving_bass.wav"), sixteenths.filter((step) => !quarter.includes(step)), "bass", 0.68),
          track("euro-synth-bass", "Synth Bass", "bass", one("Synth Bass", "seq_synth_bass_c.wav"), eighths, "bass", 0.64),
        ]),
        bank("synth", "SYNTH", [
          track("euro-supersaw", "Supersaw", "synth", one("Supersaw", "genre_supersaw.wav"), [0, 3, 6, 8, 11, 14], "lead", 0.58),
          track("euro-brass", "Synth Brass", "synth", one("Synth Brass", "genre_synth_brass.wav"), [0, 6, 8, 14], "chord", 0.60),
          track("euro-strings", "Synth Strings", "synth", one("Synth Strings", "genre_synth_strings.wav"), [0, 8], "pad", 0.48),
          track("euro-bell", "Bell", "synth", one("Bell", "genre_bell.wav"), offbeat, "lead", 0.52),
          track("euro-lead", "Lead", "synth", one("Lead", "genre_lead.wav"), [3, 6, 11, 14], "lead", 0.58),
        ]),
        bank("fx", "FX", [
          track("euro-reverse-cymbal", "Reverse Cymbal", "fx", one("Reverse Cymbal", "genre_reverse_cymbal.wav"), [15], "fx", 0.52),
          track("euro-riser", "Riser", "fx", one("Riser", "genre_riser.wav"), [12], "fx", 0.50),
          track("euro-impact", "Impact", "fx", one("Impact", "genre_impact.wav"), [0], "fx", 0.60),
          track("euro-crash-fx", "Crash FX", "fx", one("Crash", "genre_crash.wav"), [0, 8], "fx", 0.52),
          track("euro-voice-fx", "Voice FX", "fx", one("Voice FX", "genre_voice_fx.wav"), [7, 15], "fx", 0.48),
        ]),
      ],
    },

    drumandbass: {
      name: "Drum'n'Bass / DnB",
      bpm: { min: 160, max: 180, default: 174 },
      swing: 0.5,
      banks: [
        bank("drums", "DRUMS", [
          track("dnb-amen", "Amen Break", "perc", one("Amen Slice", "genre_amen_break.wav"), [0, 4, 8, 12], "loop", 0.62),
          track("dnb-kick", "Kick", "kick", kickOptions, [0, 10], "kick", 0.76),
          track("dnb-snare", "Snare", "snare", snareOptions, [4, 12], "snare", 0.74),
          track("dnb-ghost-snare", "Ghost Snare", "snare", one("Ghost Snare", "genre_ghost_snare.wav"), [3, 7, 11, 15], "ghost", 0.46),
          track("dnb-ride", "Ride", "hat", one("Ride", "genre_ride.wav"), eighths, "ride", 0.54),
        ]),
        bank("bass", "BASS", [
          track("dnb-reece", "Reece Bass", "bass", one("Reece Bass", "genre_reece_bass.wav"), [0, 3, 8, 10, 14], "bass", 0.72),
          track("dnb-sub", "Sub Bass", "bass", one("Sub Bass", "genre_sub_bass.wav"), [0, 8], "bass", 0.74),
          track("dnb-distortion", "Distortion Bass", "bass", one("Distortion Bass", "genre_distortion_bass.wav"), [2, 6, 10, 14], "bass", 0.60),
        ]),
        bank("synth", "SYNTH", [
          track("dnb-dark-pad", "Dark Pad", "synth", one("Dark Pad", "genre_dark_pad.wav"), [0, 8], "pad", 0.48),
          track("dnb-stab", "Stab", "synth", one("Stab", "genre_stab.wav"), [3, 11], "chord", 0.58),
          track("dnb-fm-bell", "FM Bell", "synth", one("FM Bell", "genre_fm_bell.wav"), [2, 6, 10, 14], "lead", 0.50),
          track("dnb-atmos-pad", "Atmos Pad", "synth", one("Atmos Pad", "genre_atmos_pad.wav"), [0], "pad", 0.42),
        ]),
        bank("fx", "FX", [
          track("dnb-glitch", "Glitch", "fx", one("Glitch", "genre_glitch.wav"), [3, 7, 11, 15], "fx", 0.52),
          track("dnb-reverse", "Reverse FX", "fx", one("Reverse FX", "genre_reverse_fx.wav"), [7, 15], "fx", 0.48),
          track("dnb-vinyl-stop", "Vinyl Stop", "fx", one("Vinyl Stop", "genre_vinyl_stop.wav"), [15], "fx", 0.52),
          track("dnb-noise-sweep", "Noise Sweep", "fx", one("Noise Sweep", "genre_noise_sweep.wav"), [12], "fx", 0.46),
          track("dnb-impact", "Impact", "fx", one("Impact", "genre_impact.wav"), [0, 8], "fx", 0.58),
        ]),
      ],
    },

    trance: {
      name: "Trance / トランス",
      bpm: { min: 135, max: 145, default: 140 },
      swing: 0.5,
      banks: [
        bank("drums", "DRUMS", [
          track("trance-kick", "Kick", "kick", kickOptions, quarter, "kick", 0.78),
          track("trance-clap", "Clap", "snare", clapOptions, backbeat, "clap", 0.68),
          track("trance-closed-hat", "Closed Hat", "hat", closedHatOptions, eighths, "hat", 0.62),
          track("trance-open-hat", "Open Hat", "hat", openHatOptions, offbeat, "openhat", 0.60),
          track("trance-ride", "Ride", "hat", one("Ride", "genre_ride.wav"), quarter, "ride", 0.54),
        ]),
        bank("bass", "BASS", [
          track("trance-rolling-bass", "Rolling Bass", "bass", one("Rolling Bass", "genre_rolling_bass.wav"), sixteenths.filter((step) => !quarter.includes(step)), "bass", 0.68),
          track("trance-sub-bass", "Sub Bass", "bass", one("Sub Bass", "genre_sub_bass.wav"), [0, 8], "bass", 0.70),
        ]),
        bank("synth", "SYNTH", [
          track("trance-supersaw", "Supersaw", "synth", one("Supersaw", "genre_supersaw.wav"), [0, 3, 6, 8, 11, 14], "lead", 0.58),
          track("trance-pad", "Pad", "synth", one("Pad", "genre_pad.wav"), [0, 8], "pad", 0.46),
          track("trance-pluck", "Pluck", "synth", one("Pluck", "seq_synth_pluck_e.wav"), offbeat, "lead", 0.58),
          track("trance-bell", "Bell", "synth", one("Bell", "genre_bell.wav"), [2, 6, 10, 14], "lead", 0.50),
          track("trance-arpeggio", "Arpeggio", "synth", one("Arpeggio", "genre_arpeggio.wav"), sixteenths, "lead", 0.52),
        ]),
        bank("fx", "FX", [
          track("trance-riser", "Riser", "fx", one("Riser", "genre_riser.wav"), [12], "fx", 0.48),
          track("trance-downlifter", "Downlifter", "fx", one("Downlifter", "genre_downlifter.wav"), [0], "fx", 0.48),
          track("trance-reverse-cymbal", "Reverse Cymbal", "fx", one("Reverse Cymbal", "genre_reverse_cymbal.wav"), [15], "fx", 0.50),
          track("trance-white-noise", "White Noise", "fx", one("White Noise", "genre_white_noise.wav"), offbeat, "fx", 0.38),
          track("trance-impact", "Impact", "fx", one("Impact", "genre_impact.wav"), [0, 8], "fx", 0.58),
        ]),
      ],
    },

    bigbeat: {
      name: "Big Beat / ビッグビート",
      bpm: { min: 125, max: 140, default: 132 },
      swing: 0.54,
      banks: [
        bank("drums", "DRUMS", [
          track("bigbeat-heavy-kick", "Heavy Kick", "kick", one("Heavy Kick", "genre_heavy_kick.wav"), [0, 7, 10], "kick", 0.78),
          track("bigbeat-snare", "Snare", "snare", snareOptions, [4, 12], "snare", 0.74),
          track("bigbeat-break", "Breakbeat Loop", "perc", one("Breakbeat Slice", "genre_breakbeat_loop.wav"), quarter, "loop", 0.62),
          track("bigbeat-closed-hat", "Closed Hat", "hat", closedHatOptions, [2, 6, 10, 14], "hat", 0.60),
          track("bigbeat-crash", "Crash", "hat", one("Crash", "genre_crash.wav"), [0, 8], "fx", 0.56),
        ]),
        bank("bass", "BASS", [
          track("bigbeat-dirty-bass", "Dirty Bass", "bass", one("Dirty Bass", "genre_dirty_bass.wav"), [0, 3, 7, 10, 14], "bass", 0.68),
          track("bigbeat-synth-bass", "Synth Bass", "bass", one("Synth Bass", "seq_synth_bass_g.wav"), [0, 6, 8, 14], "bass", 0.66),
        ]),
        bank("synth", "SYNTH", [
          track("bigbeat-stab", "Synth Stab", "synth", one("Synth Stab", "genre_stab.wav"), [3, 7, 11, 15], "chord", 0.58),
          track("bigbeat-brass", "Brass", "synth", one("Brass", "genre_brass.wav"), [0, 6, 10, 14], "chord", 0.56),
          track("bigbeat-lead", "Lead", "synth", one("Lead", "genre_lead.wav"), [3, 11], "lead", 0.56),
          track("bigbeat-pad", "Pad", "synth", one("Pad", "genre_pad.wav"), [0, 8], "pad", 0.44),
        ]),
        bank("fx", "FX", [
          track("bigbeat-scratch", "Scratch", "fx", one("Scratch", "genre_scratch.wav"), [3, 7, 11, 15], "fx", 0.54),
          track("bigbeat-explosion", "Explosion", "fx", one("Explosion", "genre_explosion.wav"), [0, 8], "fx", 0.56),
          track("bigbeat-filter-sweep", "Filter Sweep", "fx", one("Filter Sweep", "genre_filter_sweep_up.wav"), [12], "fx", 0.46),
          track("bigbeat-reverse", "Reverse FX", "fx", one("Reverse FX", "genre_reverse_fx.wav"), [7, 15], "fx", 0.48),
          track("bigbeat-voice", "Voice Sample", "fx", one("Voice Sample", "genre_voice_sample.wav"), [6, 14], "fx", 0.46),
        ]),
      ],
    },

    breakbeats: {
      name: "Breakbeats / ブレイクビーツ",
      bpm: { min: 125, max: 145, default: 136 },
      swing: 0.55,
      banks: [
        bank("drums", "DRUMS", [
          track("breaks-loop", "Breakbeat Loop", "perc", one("Breakbeat Slice", "genre_breakbeat_loop.wav"), quarter, "loop", 0.62),
          track("breaks-kick", "Kick", "kick", kickOptions, [0, 7, 10], "kick", 0.76),
          track("breaks-snare", "Snare", "snare", snareOptions, [4, 12], "snare", 0.72),
          track("breaks-closed-hat", "Closed Hat", "hat", closedHatOptions, [2, 6, 10, 14], "hat", 0.58),
          track("breaks-ride", "Ride", "hat", one("Ride", "genre_ride.wav"), eighths, "ride", 0.52),
        ]),
        bank("bass", "BASS", [
          track("breaks-funky-bass", "Funky Bass", "bass", one("Funky Bass", "genre_funky_bass.wav"), [0, 3, 7, 10, 13, 15], "bass", 0.66),
          track("breaks-sub-bass", "Sub Bass", "bass", one("Sub Bass", "genre_sub_bass.wav"), [0, 8], "bass", 0.70),
        ]),
        bank("synth", "SYNTH", [
          track("breaks-electric-piano", "Electric Piano", "piano", one("Electric Piano", "genre_electric_piano.wav"), [2, 6, 10, 14], "chord", 0.56),
          track("breaks-synth-lead", "Synth Lead", "synth", one("Synth Lead", "genre_saw_lead.wav"), [3, 11], "lead", 0.54),
          track("breaks-pad", "Pad", "synth", one("Pad", "genre_pad.wav"), [0, 8], "pad", 0.44),
          track("breaks-stab", "Stab", "synth", one("Stab", "genre_stab.wav"), [3, 7, 11, 15], "chord", 0.56),
        ]),
        bank("fx", "FX", [
          track("breaks-scratch", "Scratch", "fx", one("Scratch", "genre_scratch.wav"), [3, 11], "fx", 0.52),
          track("breaks-reverse-cymbal", "Reverse Cymbal", "fx", one("Reverse Cymbal", "genre_reverse_cymbal.wav"), [15], "fx", 0.48),
          track("breaks-noise-sweep", "Noise Sweep", "fx", one("Noise Sweep", "genre_noise_sweep.wav"), [12], "fx", 0.44),
          track("breaks-hit", "FX Hit", "fx", one("FX Hit", "genre_fx_hit.wav"), [0, 8], "fx", 0.56),
          track("breaks-voice", "Voice Sample", "fx", one("Voice Sample", "genre_voice_sample.wav"), [7, 15], "fx", 0.46),
        ]),
      ],
    },

    hiphop: {
      name: "Hip Hop / ヒップホップ",
      bpm: { min: 80, max: 105, default: 92 },
      swing: 0.58,
      banks: [
        bank("drums", "DRUMS", [
          track("hiphop-kick", "Kick", "kick", kickOptions, [0, 7, 10], "kick", 0.76),
          track("hiphop-snare", "Snare", "snare", snareOptions, backbeat, "snare", 0.74),
          track("hiphop-closed-hat", "Closed Hat", "hat", closedHatOptions, eighths, "hat", 0.58),
          track("hiphop-open-hat", "Open Hat", "hat", openHatOptions, [6, 14], "openhat", 0.54),
          track("hiphop-clap", "Clap", "snare", clapOptions, [12], "clap", 0.58),
        ]),
        bank("bass", "BASS", [
          track("hiphop-808", "808 Bass", "bass", one("808 Bass", "genre_808_bass.wav"), [0, 7, 10, 14], "bass", 0.74),
          track("hiphop-finger-bass", "Finger Bass", "bass", one("Finger Bass", "genre_finger_bass.wav"), [0, 3, 7, 10, 14], "bass", 0.64),
          track("hiphop-sub", "Sub Bass", "bass", one("Sub Bass", "genre_sub_bass.wav"), [0, 8], "bass", 0.70),
        ]),
        bank("synth", "SYNTH", [
          track("hiphop-electric-piano", "Electric Piano", "piano", one("Electric Piano", "genre_electric_piano.wav"), [0, 6, 10, 14], "chord", 0.56),
          track("hiphop-organ", "Organ", "piano", one("Organ", "genre_organ.wav"), [0, 8], "chord", 0.50),
          track("hiphop-brass", "Brass", "synth", one("Brass", "genre_brass.wav"), [3, 11], "chord", 0.52),
          track("hiphop-strings", "Strings", "synth", one("Strings", "genre_strings.wav"), [0, 8], "pad", 0.44),
          track("hiphop-bell", "Bell", "synth", one("Bell", "genre_bell.wav"), [2, 10], "lead", 0.48),
        ]),
        bank("fx", "FX", [
          track("hiphop-scratch", "Scratch", "fx", one("Scratch", "genre_scratch.wav"), [3, 11], "fx", 0.52),
          track("hiphop-vinyl", "Vinyl Noise", "fx", one("Vinyl Noise", "genre_vinyl_noise.wav"), quarter, "texture", 0.26),
          track("hiphop-voice", "Voice FX", "fx", one("Voice FX", "genre_voice_fx.wav"), [7, 15], "fx", 0.44),
          track("hiphop-reverse-cymbal", "Reverse Cymbal", "fx", one("Reverse Cymbal", "genre_reverse_cymbal.wav"), [15], "fx", 0.46),
          track("hiphop-impact", "Impact", "fx", one("Impact", "genre_impact.wav"), [0, 8], "fx", 0.54),
        ]),
      ],
    },

    world: {
      name: "World Groove / ワールド",
      bpm: { min: 90, max: 130, default: 112 },
      swing: 0.54,
      banks: [
        bank("drums", "DRUMS", [
          track("world-conga", "Conga", "perc", one("Conga", "genre_conga.wav"), [0, 3, 7, 10, 14], "perc", 0.66),
          track("world-bongo", "Bongo", "perc", one("Bongo", "genre_bongo.wav"), [2, 5, 9, 13, 15], "perc", 0.62),
          track("world-djembe", "Djembe", "perc", one("Djembe", "genre_djembe.wav"), [0, 6, 8, 14], "kick", 0.68),
          track("world-shaker", "Shaker", "hat", one("Shaker", "genre_shaker.wav"), eighths, "hat", 0.56),
          track("world-tambourine", "Tambourine", "perc", one("Tambourine", "genre_tambourine.wav"), offbeat, "hat", 0.56),
        ]),
        bank("bass", "BASS", [
          track("world-electric-bass", "Electric Bass", "bass", one("Electric Bass", "genre_electric_bass.wav"), [0, 3, 7, 10, 14], "bass", 0.66),
          track("world-acoustic-bass", "Acoustic Bass", "bass", one("Acoustic Bass", "genre_acoustic_bass.wav"), [0, 6, 10, 14], "bass", 0.64),
        ]),
        bank("synth", "MELODY", [
          track("world-marimba", "Marimba", "world", one("Marimba", "genre_marimba.wav"), [0, 3, 6, 10, 14], "lead", 0.58),
          track("world-kalimba", "Kalimba", "world", one("Kalimba", "genre_kalimba.wav"), offbeat, "lead", 0.54),
          track("world-pan-flute", "Pan Flute", "world", one("Pan Flute", "genre_pan_flute.wav"), [0, 6, 10, 14], "lead", 0.52),
          track("world-flute", "Flute", "world", one("Flute", "genre_flute.wav"), [3, 11], "lead", 0.50),
          track("world-sitar", "Sitar", "world", one("Sitar", "genre_sitar.wav"), [2, 6, 10, 14], "lead", 0.54),
          track("world-koto", "Koto", "world", one("Koto", "genre_koto.wav"), [0, 4, 7, 11, 14], "lead", 0.54),
        ]),
        bank("fx", "NATURE", [
          track("world-bird", "Bird", "fx", one("Bird", "genre_bird.wav"), [3, 11], "texture", 0.38),
          track("world-river", "River", "fx", one("River", "genre_river.wav"), quarter, "texture", 0.28),
          track("world-wind", "Wind", "fx", one("Wind", "genre_wind.wav"), [0, 8], "texture", 0.30),
          track("world-forest", "Forest", "fx", one("Forest", "genre_forest.wav"), [0], "texture", 0.28),
          track("world-rain", "Rain", "fx", one("Rain", "genre_rain.wav"), eighths, "texture", 0.26),
        ]),
      ],
    },

    jazz: {
      name: "Jazz / ジャズ",
      bpm: { min: 100, max: 160, default: 124 },
      swing: 0.62,
      banks: [
        bank("drums", "DRUMS", [
          track("jazz-kick", "Jazz Kick", "kick", one("Jazz Kick", "genre_jazz_kick.wav"), [0, 10], "kick", 0.62),
          track("jazz-snare-brush", "Snare Brush", "snare", one("Snare Brush", "genre_snare_brush.wav"), backbeat, "snare", 0.58),
          track("jazz-ride", "Ride", "hat", one("Ride", "genre_ride.wav"), [0, 3, 6, 8, 11, 14], "ride", 0.56),
          track("jazz-closed-hat", "Closed Hat", "hat", closedHatOptions, backbeat, "hat", 0.48),
          track("jazz-crash", "Crash", "hat", one("Crash", "genre_crash.wav"), [0], "fx", 0.50),
        ]),
        bank("bass", "BASS", [
          track("jazz-upright-bass", "Upright Bass", "bass", one("Upright Bass", "genre_upright_bass.wav"), quarter, "bass", 0.64),
          track("jazz-finger-bass", "Finger Bass", "bass", one("Finger Bass", "genre_finger_bass.wav"), [0, 3, 7, 10, 14], "bass", 0.58),
        ]),
        bank("synth", "KEYS", [
          track("jazz-grand-piano", "Grand Piano", "piano", one("Grand Piano", "genre_grand_piano.wav"), [0, 6, 10, 14], "chord", 0.58),
          track("jazz-electric-piano", "Electric Piano", "piano", one("Electric Piano", "genre_electric_piano.wav"), [2, 6, 10, 14], "chord", 0.54),
          track("jazz-organ", "Organ", "piano", one("Organ", "genre_organ.wav"), [0, 8], "chord", 0.50),
          track("jazz-brass-section", "Brass Section", "synth", one("Brass Section", "genre_brass_section.wav"), [3, 11], "chord", 0.52),
          track("jazz-vibraphone", "Vibraphone", "world", one("Vibraphone", "genre_vibraphone.wav"), offbeat, "lead", 0.50),
        ]),
        bank("fx", "AMBIENCE", [
          track("jazz-applause", "Applause", "fx", one("Applause", "genre_applause.wav"), [0], "texture", 0.34),
          track("jazz-finger-snap", "Finger Snap", "snare", one("Finger Snap", "genre_finger_snap.wav"), backbeat, "clap", 0.52),
          track("jazz-club", "Club Ambience", "fx", one("Club Ambience", "genre_club_ambience.wav"), quarter, "texture", 0.24),
          track("jazz-brush-sweep", "Brush Sweep", "fx", one("Brush Sweep", "genre_brush_sweep.wav"), [7, 15], "fx", 0.42),
          track("jazz-reverse-cymbal", "Reverse Cymbal", "fx", one("Reverse Cymbal", "genre_reverse_cymbal.wav"), [15], "fx", 0.44),
        ]),
      ],
    },
  };
})();
