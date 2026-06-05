/**
 * Name lists for population generation, grouped by background so the
 * "ethnicity / language mix" config option can weight the draws.
 *
 * These are deliberately broad cultural groupings used only to give the
 * synthetic population some plausible diversity — they are not stored on the
 * citizen record (the Identity system has no ethnicity field).
 */

export type EthnicGroup = "African" | "Asian" | "Latin American" | "European";

export const ETHNIC_GROUPS: EthnicGroup[] = [
  "African",
  "Asian",
  "Latin American",
  "European",
];

interface NameSet {
  male: string[];
  female: string[];
  family: string[];
}

export const NAMES_BY_GROUP: Record<EthnicGroup, NameSet> = {
  African: {
    male: [
      "Kwame", "Kofi", "Ade", "Chidi", "Emeka", "Babajide", "Thabo", "Sipho",
      "Tendai", "Jabari", "Sekou", "Oumar", "Moussa",
    ],
    female: [
      "Amara", "Nia", "Zara", "Adaeze", "Fatou", "Amina", "Nana",
      "Thandiwe", "Chioma", "Aisha", "Halima", "Fanta", "Mariama",
    ],
    family: [
      "Okafor", "Mensah", "Diallo", "Adebayo", "Nkemelu", "Mwangi",
      "Dlamini", "Achebe", "Osei", "Bello",
    ],
  },
  Asian: {
    male: [
      "Wei", "Jun", "Hiro", "Ravi", "Arjun", "Raj", "Takeshi", "Min",
      "Sanjay", "Tuan", "Chen", "Kenji", "Akira",
    ],
    female: [
      "Mei", "Yuki", "Priya", "Ananya", "Sakura", "Linh", "Suki",
      "Aiko", "Deepa", "Kamala", "Nisha", "Rina", "Mei-Ling",
    ],
    family: [
      "Tanaka", "Singh", "Patel", "Nguyen", "Chen", "Kim", "Sato",
      "Wang", "Gupta", "Reddy",
    ],
  },
  "Latin American": {
    male: [
      "Carlos", "Diego", "Mateo", "Santiago", "Andres", "Rafael", "Lucas",
      "Miguel", "Juan", "Fernando", "Alejandro", "Pedro", "Jorge",
    ],
    female: [
      "Maria", "Sofia", "Valentina", "Camila", "Isabella", "Lucia",
      "Gabriela", "Mariana", "Elena", "Ana", "Catalina", "Paula", "Carolina",
    ],
    family: [
      "Garcia", "Rodriguez", "Martinez", "Lopez", "Gonzalez", "Hernandez",
      "Silva", "Reyes", "Castro", "Vargas",
    ],
  },
  European: {
    male: [
      "James", "Oliver", "Lars", "Hans", "Pierre", "Ivan", "Mikhail",
      "Liam", "Noah", "Ethan", "William", "Thomas", "Stefan",
    ],
    female: [
      "Emma", "Olivia", "Sophie", "Charlotte", "Anna", "Elise", "Greta",
      "Ingrid", "Marie", "Klara", "Nina", "Eva", "Laura",
    ],
    family: [
      "Smith", "Johnson", "Muller", "Novak", "Rossi", "Andersson",
      "Kowalski", "Petrov", "Dubois", "Bauer",
    ],
  },
};

export const cityNames: string[] = [
  "Port Meridian", "New Halcyon", "Castellan", "Riverbend", "Northgate",
  "Eastmere", "Solaris City", "Greenhaven", "Westford", "Aurora Bay",
  "Highvale", "Stonebridge",
];
