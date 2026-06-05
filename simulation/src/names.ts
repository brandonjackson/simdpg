/**
 * Diverse name lists for population generation.
 * Mix of African, Asian, Latin American, and European names.
 */

export const maleGivenNames: readonly string[] = [
  // African
  "Kwame", "Kofi", "Ade", "Chidi", "Emeka", "Babajide", "Thabo", "Sipho",
  "Tendai", "Jabari", "Sekou", "Oumar", "Moussa",
  // Asian
  "Wei", "Jun", "Hiro", "Ravi", "Arjun", "Raj", "Takeshi", "Min",
  "Sanjay", "Tuan", "Chen", "Kenji", "Akira",
  // Latin American
  "Carlos", "Diego", "Mateo", "Santiago", "Andres", "Rafael", "Lucas",
  "Miguel", "Juan", "Fernando", "Alejandro", "Pedro", "Jorge",
  // European
  "James", "Oliver", "Lars", "Hans", "Pierre", "Ivan", "Mikhail",
  "Liam", "Noah", "Ethan", "William", "Thomas", "Stefan",
] as const;

export const femaleGivenNames: readonly string[] = [
  // African
  "Amara", "Nia", "Zara", "Adaeze", "Fatou", "Amina", "Nana",
  "Thandiwe", "Chioma", "Aisha", "Halima", "Fanta", "Mariama",
  // Asian
  "Mei", "Yuki", "Priya", "Ananya", "Sakura", "Linh", "Suki",
  "Aiko", "Deepa", "Kamala", "Nisha", "Rina", "Mei-Ling",
  // Latin American
  "Maria", "Sofia", "Valentina", "Camila", "Isabella", "Lucia",
  "Gabriela", "Mariana", "Elena", "Ana", "Catalina", "Paula", "Carolina",
  // European
  "Sophie", "Emma", "Ingrid", "Greta", "Colette", "Anastasia", "Elise",
  "Charlotte", "Isla", "Freya", "Clara", "Madeleine", "Hanna",
] as const;

export const familyNames: readonly string[] = [
  // African
  "Okafor", "Mensah", "Diallo", "Traore", "Nkosi", "Mwangi",
  "Abubakar", "Kone", "Osei", "Kamara", "Okoro", "Adeyemi",
  // Asian
  "Tanaka", "Patel", "Wang", "Kim", "Nguyen", "Singh",
  "Yamamoto", "Sharma", "Li", "Suzuki", "Chen", "Gupta",
  // Latin American
  "Rodriguez", "Silva", "Garcia", "Mendez", "Torres", "Reyes",
  "Morales", "Vargas", "Santos", "Herrera", "Cruz", "Castillo",
  // European
  "Mueller", "Dubois", "Smith", "Johansson", "Rossi", "Petrov",
  "Anderson", "Brown", "Martin", "Fischer", "Bernard", "Kowalski",
] as const;

/** City names used for addresses and places. */
export const cityNames: readonly string[] = [
  "Westville", "Oakridge", "Sunnyvale", "Riverside", "Greenfield",
  "Milltown", "Fairview", "Springfield", "Lakewood", "Maplewood",
  "Cedarville", "Brookside", "Hillcrest", "Pinewood", "Ashton",
  "Bayview", "Clearwater", "Eastport", "Northgate", "Southfield",
] as const;

/** Facility names for health encounters. */
export const facilityNames: readonly string[] = [
  "Central Hospital", "Community Health Center", "District Clinic",
  "Regional Medical Center", "Primary Care Unit", "Rural Health Post",
  "University Hospital", "Women & Children Hospital",
  "General Practice Clinic", "National Referral Hospital",
] as const;

/** Provider names for health encounters. */
export const providerNames: readonly string[] = [
  "Dr. Mwangi", "Dr. Patel", "Dr. Silva", "Dr. Mueller", "Dr. Tanaka",
  "Dr. Diallo", "Dr. Garcia", "Dr. Johansson", "Dr. Wang", "Dr. Smith",
  "Nurse Aisha", "Nurse Priya", "Nurse Sofia", "Nurse Ingrid", "Nurse Amara",
] as const;
