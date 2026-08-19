export type Dit = {
  slug: string;
  name: string;
  description: string;
  file: string;
};

/** The Dit comes first. Everything else is a variation on the theme. */
export const dits: Dit[] = [
  {
    slug: "thedit",
    name: "The Dit",
    description: "The original. Yellow, round, unbothered.",
    file: "/dits/thedit.png",
  },
  {
    slug: "pointdit",
    name: "Point Dit",
    description: "Points directly at you. Make of that what you will.",
    file: "/dits/pointdit.png",
  },
  {
    slug: "whatdit",
    name: "What Dit",
    description: "Eyes wide, eyebrows up. Has just read the thread.",
    file: "/dits/whatdit.png",
  },
  {
    slug: "scareddit",
    name: "Scared Dit",
    description: "Fists clenched, bracing for the deploy.",
    file: "/dits/scareddit.png",
  },
  {
    slug: "cowboydit",
    name: "Cowboy Dit",
    description: "Hat and jeans, nothing else. Yeehaw.",
    file: "/dits/cowboydit.png",
  },
  {
    slug: "cryingcowboydit",
    name: "Crying Cowboy Dit",
    description: "Same cowboy, rougher week.",
    file: "/dits/cryingcowboydit.png",
  },
  {
    slug: "djdit",
    name: "DJ Dit",
    description: "Behind the decks in a snapback and gold chain.",
    file: "/dits/djdit.png",
  },
  {
    slug: "agentdit",
    name: "Agent Dit",
    description: "Black suit, dark shades, badge out.",
    file: "/dits/agentdit.png",
  },
];
