/**
 * Timeline config: Goodbye (Dark OST) – Apparat.
 * Audio starts at 0:00. Intro (dark + Welcome) 0–13s; main scene from 13s.
 * Scene time = time since 13s (0–124s).
 */

export interface SceneSegment {
  id: number;
  title: string;
  time: { start: string; end: string };
  /** Start in scene time (seconds since 13s) */
  startSeconds: number;
  endSeconds: number;
  sanskrit: string;
  translation: string;
  description: string;
}

export interface TimelineConfig {
  audio: {
    track: string;
    artist: string;
    /** Intro duration: dark + "Welcome!" (seconds) */
    introEndSeconds: number;
    /** Total track length in seconds (for end/fade/restart) */
    totalDurationSeconds: number;
    /** Scene duration in seconds (totalDurationSeconds - introEndSeconds) */
    totalSceneDurationSeconds: number;
  };
  sceneTimeline: SceneSegment[];
  loopBehavior: {
    fadeToBlack: boolean;
    silenceAfterEndSeconds: number;
    restartFrom: string;
  };
}

export const TIMELINE_CONFIG: TimelineConfig = {
  audio: {
    track: 'Goodbye',
    artist: 'Apparat (Dark OST)',
    introEndSeconds: 13,
    totalDurationSeconds: 137,
    totalSceneDurationSeconds: 124,
  },
  sceneTimeline: [
    {
      id: 1,
      title: 'विश्वकर्मा — The Eternal Architect',
      time: { start: '0:13', end: '0:30' },
      startSeconds: 0,
      endSeconds: 17,
      sanskrit: 'ॐ विश्वकर्मणे नमः।',
      translation: 'Om. Salutations to Vishwakarma — the All-Maker.',
      description:
        'In the stillness, the divine form emerges. He who fashioned the cosmos, the celestial palaces, and the weapons of the gods. The Lord of a thousand arts — creator, unseen yet ever present.',
    },
    {
      id: 2,
      title: 'सृष्टि — Before Creation, Design',
      time: { start: '0:30', end: '0:50' },
      startSeconds: 17,
      endSeconds: 37,
      sanskrit: 'सृष्टेः पूर्वं विचारः। यत् चिन्तितं तत् सृज्यते।',
      translation:
        'Before creation, there is design. What is conceived in thought is brought into form.',
      description:
        'Every temple, every tool, every wonder of the world begins as a thought in the mind of the divine architect. Wisdom shapes intention; intention becomes form. So it has been since the dawn of time.',
    },
    {
      id: 3,
      title: 'ज्ञानं च कर्म — Knowledge Embodied in Action',
      time: { start: '0:50', end: '1:10' },
      startSeconds: 37,
      endSeconds: 57,
      sanskrit: 'ज्ञानं कर्मणि प्रतिष्ठितम्। शिल्पं दिव्यं करपुस्तके।',
      translation: 'Knowledge finds its purpose in action. Divine craft rests in the hands.',
      description:
        'In his hands — the water-pot of purity, the scriptures of wisdom, the tools of the artisan. Not as a warrior, but as the embodiment of skill and knowledge. The carpenter of the gods; the most eminent of artisans.',
    },
    {
      id: 4,
      title: 'शिल्पिनां देवः — Patron of All Who Create',
      time: { start: '1:10', end: '1:30' },
      startSeconds: 57,
      endSeconds: 77,
      sanskrit: 'शिल्पिनां देवः विश्वकर्मा। सर्वकर्मसु अग्रणीः।',
      translation: 'Vishwakarma is the divine patron of all artisans. Foremost in every craft.',
      description:
        'Craftsmen, engineers, builders, and creators — across ages and lands — turn to him. He who built Lanka, Dwarka, Indraprastha; he who forged the Vajra, the Sudarshana Chakra, the Trishula. Our guide, our inspiration.',
    },
    {
      id: 5,
      title: 'संयमेन सौन्दर्यम् — Beauty Through Discipline',
      time: { start: '1:30', end: '1:45' },
      startSeconds: 77,
      endSeconds: 92,
      sanskrit: 'संयमेन सृज्यते सौन्दर्यम्। सत्यं शिवं सुन्दरम्।',
      translation: 'Beauty is born from discipline. Truth, auspiciousness, beauty.',
      description:
        'The rotation slows. Light touches the edges of form. Perfection is not haste — it is balance, patience, and restraint. In every line, every curve, the divine architect reminds us: creation is sacred.',
    },
    {
      id: 6,
      title: 'कालातीतः — The Architect Beyond Time',
      time: { start: '1:45', end: '2:17' },
      startSeconds: 92,
      endSeconds: 124,
      sanskrit: 'कालातीतः शिल्पकारः। अदृश्यः च सर्वत्र।',
      translation: 'The architect beyond time. Unseen, yet present everywhere.',
      description:
        'As the music withdraws, the form returns to stillness. Light lingers once more on the crown — then dissolves into darkness. Vishwakarma remains. Unseen, yet eternal. In every craft, every creation, he is there.',
    },
  ],
  loopBehavior: {
    fadeToBlack: true,
    silenceAfterEndSeconds: 2,
    restartFrom: '0:00',
  },
};
