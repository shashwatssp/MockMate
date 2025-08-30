import { insertQuestions } from '../lib/database'

const sampleQuestions = [
  {
    id: "Q001",
    text: "If the critical angle for total internal reflection from a medium to vacuum is 30°, what is the velocity of light in the medium?",
    options: ['3 × 10⁸ m/s', '1.5 × 10⁸ m/s', '0.75 × 10⁸ m/s', '2 × 10⁸ m/s'],
    correctAnswer: 1,
    topic: "Optics",
    subject: "Physics",
    difficulty: "Medium",
    year: "2024"
  },
  {
    id: "Q002",
    text: "What is the magnification produced by plane mirrors?",
    options: ['+1', 'Zero', '-1', 'None of these'],
    correctAnswer: 0,
    topic: "Optics",
    subject: "Physics",
    difficulty: "Easy",
    year: "2024"
  },
  {
    id: "Q003",
    text: "What is the law that governs forces between electric charges?",
    options: ["Coulomb's law", "Faraday's law", "Ampere's law", "Ohm's law"],
    correctAnswer: 0,
    topic: "Electrostatics",
    subject: "Physics",
    difficulty: "Easy",
    year: "2024"
  },
  {
    id: "Q004",
    text: "The minimum charge on a particle is:",
    options: ['6.6 × 10⁻¹⁹ Coulomb', '1.6 × 10⁻¹⁹ Coulomb', '3.2 × 10⁻¹⁹ Coulomb', '1 Coulomb'],
    correctAnswer: 1,
    topic: "Electrostatics",
    subject: "Physics",
    difficulty: "Easy",
    year: "2024"
  },
  {
    id: "Q005",
    text: "Thermocouples are based on which principle?",
    options: ['Peltier effect', 'Joule effect', 'Thomson effect', 'Seebeck effect'],
    correctAnswer: 3,
    topic: "Current Electricity",
    subject: "Physics",
    difficulty: "Medium",
    year: "2024"
  },
  {
    id: "Q006",
    text: "The temperature coefficient of resistance is positive for:",
    options: ['Copper', 'Carbon', 'Germanium', 'An electrolyte'],
    correctAnswer: 0,
    topic: "Current Electricity",
    subject: "Physics",
    difficulty: "Medium",
    year: "2024"
  },
  {
    id: "Q007",
    text: "What happens to the gravitational potential at the centre of a uniform spherical shell that shrinks progressively?",
    options: ['Increases', 'Remains constant', 'Oscillates', 'Decreases'],
    correctAnswer: 1,
    topic: "Gravitation",
    subject: "Physics",
    difficulty: "Hard",
    year: "2024"
  },
  {
    id: "Q008",
    text: "The atmosphere surrounding the earth is held by:",
    options: ['Gravity', 'Clouds', 'Winds', 'None of the above'],
    correctAnswer: 0,
    topic: "Gravitation",
    subject: "Physics",
    difficulty: "Easy",
    year: "2024"
  },
  {
    id: "Q009",
    text: "Lassaigne's test for halogen requires the extract to be boiled with concentrated HNO₃. Why?",
    options: ["To increase AgCl's precipitation", "To increase the product solubility of AgCl", "For increasing concentration of NO₃⁻ ions", "Decomposition of NaCN and Na₂S"],
    correctAnswer: 3,
    topic: "Organic Chemistry",
    subject: "Chemistry",
    difficulty: "Medium",
    year: "2024"
  },
  {
    id: "Q010",
    text: "Which method is suitable for separating a mixture of benzoic acid and naphthalene?",
    options: ['Sublimation', 'Distillation', 'Chromatography', 'Crystallization'],
    correctAnswer: 0,
    topic: "Organic Chemistry",
    subject: "Chemistry",
    difficulty: "Medium",
    year: "2024"
  },
  {
    id: "Q011",
    text: "Which of the following molecules has the highest dipole moment?",
    options: ['NF₃', 'CO₂', 'NH₃', 'CH₄'],
    correctAnswer: 2,
    topic: "Chemical Bonding",
    subject: "Chemistry",
    difficulty: "Medium",
    year: "2024"
  },
  {
    id: "Q012",
    text: "In a reversible reaction, if the concentration of reactants is increased, what happens to the equilibrium constant?",
    options: ['Increases', 'Remains unchanged', 'Decreases', 'Depends on the concentration'],
    correctAnswer: 1,
    topic: "Chemical Equilibrium",
    subject: "Chemistry",
    difficulty: "Medium",
    year: "2024"
  },
  {
    id: "Q013",
    text: "Photochemical smog does not normally include:",
    options: ['Ozone', 'Acrolein', 'Peroxyacetyl nitrate', 'Chlorofluorocarbons'],
    correctAnswer: 3,
    topic: "Environmental Chemistry",
    subject: "Chemistry",
    difficulty: "Easy",
    year: "2024"
  },
  {
    id: "Q014",
    text: "For equal n values, the penetration power of orbitals follows which order?",
    options: ['p > s > d > f', 's < p < d < f', 's = p = d = f', 'f < d < p < s'],
    correctAnswer: 3,
    topic: "Atomic Structure",
    subject: "Chemistry",
    difficulty: "Hard",
    year: "2024"
  },
  {
    id: "Q015",
    text: "Which of the following is the strongest oxidizing agent?",
    options: ['O₃', 'KMnO₄', 'H₂O₂', 'K₂Cr₂O₇'],
    correctAnswer: 1,
    topic: "Redox Reactions",
    subject: "Chemistry",
    difficulty: "Medium",
    year: "2024"
  },
  {
    id: "Q016",
    text: "Which process converts liquid hydrocarbons to gaseous hydrocarbons?",
    options: ['Cracking', 'Oxidation', 'Hydrolysis', 'Distillation'],
    correctAnswer: 0,
    topic: "Hydrocarbons",
    subject: "Chemistry",
    difficulty: "Easy",
    year: "2024"
  },
  {
    id: "Q017",
    text: "A compound with a bond angle of 180° is:",
    options: ['Alkene', 'Cycloalkane', 'Alkane', 'Alkyne'],
    correctAnswer: 3,
    topic: "Hydrocarbons",
    subject: "Chemistry",
    difficulty: "Easy",
    year: "2024"
  },
  {
    id: "Q018",
    text: "Which is the amphoteric oxide among the following?",
    options: ['BaO', 'MgO', 'BeO', 'CaO'],
    correctAnswer: 2,
    topic: "S-Block Elements",
    subject: "Chemistry",
    difficulty: "Medium",
    year: "2024"
  },
  {
    id: "Q019",
    text: "Which of the following secretions plays an important role in fat digestion?",
    options: ['Saliva and gastric juice', 'Bile juice and pancreatic juice', 'Intestinal juice and saliva', 'Gastric juice and intestinal juice'],
    correctAnswer: 1,
    topic: "Digestion and Absorption",
    subject: "Biology",
    difficulty: "Easy",
    year: "2024"
  },
  {
    id: "Q020",
    text: "Which organism breathes through its skin?",
    options: ['Fish', 'Frog', 'Bird', 'Reptile'],
    correctAnswer: 1,
    topic: "Breathing and Exchange of Gases",
    subject: "Biology",
    difficulty: "Easy",
    year: "2024"
  },
  {
    id: "Q021",
    text: "Homeothermy is exhibited by:",
    options: ['All amniotes', 'Birds and Mammals', 'All deuterostomes', 'Reptiles and Mammals'],
    correctAnswer: 1,
    topic: "Animal Kingdom",
    subject: "Biology",
    difficulty: "Medium",
    year: "2024"
  },
  {
    id: "Q022",
    text: "Which of the following developed for the first time in Annelids?",
    options: ['Cephalization', 'Development of a true coelom', 'Metameric segmentation', 'Both 2 and 3'],
    correctAnswer: 3,
    topic: "Animal Kingdom",
    subject: "Biology",
    difficulty: "Hard",
    year: "2024"
  },
  {
    id: "Q023",
    text: "The most obvious and complicated feature of all living organisms is:",
    options: ['The ability to sense surroundings', 'Reproduction for progeny', 'Growth due to cell division', 'Complex organ systems'],
    correctAnswer: 0,
    topic: "The Living World",
    subject: "Biology",
    difficulty: "Medium",
    year: "2024"
  },
  {
    id: "Q024",
    text: "In biological nomenclature, which statement is incorrect?",
    options: ['Names are in Latin and italicized', 'First word is genus, second is species', 'Both words are underlined when handwritten', 'Genus starts with capital, species with small letter'],
    correctAnswer: 2,
    topic: "Biological Classification",
    subject: "Biology",
    difficulty: "Medium",
    year: "2024"
  },
  {
    id: "Q025",
    text: "Which characteristic can be regarded as synapomorphies of Porifera?",
    options: ['Collared cells called choanocytes', 'Canal system with ostia', 'Mineral spicules', 'High cellular mobility'],
    correctAnswer: 0,
    topic: "Animal Kingdom",
    subject: "Biology",
    difficulty: "Hard",
    year: "2024"
  },
  {
    id: "Q026",
    text: "When an electric dipole is kept in a non-uniform electric field, it experiences:",
    options: ['Both force and torque', 'Neither force nor torque', 'Only force', 'Only torque'],
    correctAnswer: 0,
    topic: "Electrostatics",
    subject: "Physics",
    difficulty: "Medium",
    year: "2023"
  },
  {
    id: "Q027",
    text: "In a series connection, the equivalent resistance is always:",
    options: ['Less than the lowest component', 'Equal to sum of components', 'Equal to mean of components', 'Between lowest and highest'],
    correctAnswer: 1,
    topic: "Current Electricity",
    subject: "Physics",
    difficulty: "Easy",
    year: "2023"
  },
  {
    id: "Q028",
    text: "If a satellite takes time T for revolution, its kinetic energy is proportional to:",
    options: ['1/T', '1/T²', '1/T³', 'T⁻²/³'],
    correctAnswer: 1,
    topic: "Gravitation",
    subject: "Physics",
    difficulty: "Hard",
    year: "2023"
  },
  {
    id: "Q029",
    text: "The entropy and enthalpy change for a reaction are 105 J K⁻¹ mol⁻¹ and 30 kJ mol⁻¹. At what temperature is the reaction in equilibrium?",
    options: ['450 K', '285.7 K', '300 K', '273 K'],
    correctAnswer: 1,
    topic: "Thermodynamics",
    subject: "Chemistry",
    difficulty: "Hard",
    year: "2023"
  },
  {
    id: "Q030",
    text: "Three moles of ideal gas expand spontaneously in vacuum. The work done is:",
    options: ['Infinite', '3 Joules', '9 Joules', 'Zero'],
    correctAnswer: 3,
    topic: "Thermodynamics",
    subject: "Chemistry",
    difficulty: "Medium",
    year: "2023"
  },
  {
    id: "Q031",
    text: "A hydrogen atom's excitation energy from ground to third state is:",
    options: ['10.2 eV', '12.75 eV', '12.1 eV', '0.85 eV'],
    correctAnswer: 2,
    topic: "Atomic Structure",
    subject: "Chemistry",
    difficulty: "Hard",
    year: "2023"
  },
  {
    id: "Q032",
    text: "How many unpaired electrons does N₂⁺ have?",
    options: ['Zero', 'One', 'Two', 'Three'],
    correctAnswer: 1,
    topic: "Chemical Bonding",
    subject: "Chemistry",
    difficulty: "Medium",
    year: "2023"
  },
  {
    id: "Q033",
    text: "Alkali metals' tendency to lose valence electrons makes them:",
    options: ['Strong oxidizing agents', 'Weak oxidizing agents', 'Strong reducing agents', 'Weak reducing agents'],
    correctAnswer: 2,
    topic: "S-Block Elements",
    subject: "Chemistry",
    difficulty: "Easy",
    year: "2023"
  },
  {
    id: "Q034",
    text: "The number of bridging oxygen atoms in P₄O₁₀ is:",
    options: ['5', '4', '2', '6'],
    correctAnswer: 3,
    topic: "P-Block Elements",
    subject: "Chemistry",
    difficulty: "Medium",
    year: "2023"
  },
  {
    id: "Q035",
    text: "Which of the following is NOT a characteristic of nematodes?",
    options: ['Covered with thick cuticle', 'Cuticle that moults', 'Pseudocoelomate body', 'Bilateral symmetry'],
    correctAnswer: 1,
    topic: "Animal Kingdom",
    subject: "Biology",
    difficulty: "Medium",
    year: "2023"
  },
  {
    id: "Q036",
    text: "Ctenophores are distinguished by:",
    options: ['Being largest animals moving with cilia', 'Having cnidoblasts', 'Radial symmetry only', 'Presence of coelom'],
    correctAnswer: 0,
    topic: "Animal Kingdom",
    subject: "Biology",
    difficulty: "Hard",
    year: "2023"
  },
  {
    id: "Q037",
    text: "Which characters are present in bony fishes?",
    options: ['Air bladder, Operculum, Viviparity', 'Air bladder and Viviparity only', 'Air bladder and Operculum only', 'Operculum and Viviparity only'],
    correctAnswer: 2,
    topic: "Animal Kingdom",
    subject: "Biology",
    difficulty: "Medium",
    year: "2023"
  },
  {
    id: "Q038",
    text: "The scientific term for biological classification categories is:",
    options: ['Taxonomy', 'Nomenclature', 'Taxon', 'Systematics'],
    correctAnswer: 2,
    topic: "Biological Classification",
    subject: "Biology",
    difficulty: "Easy",
    year: "2023"
  },
  {
    id: "Q039",
    text: "The dimensional formula of coefficient of thermal conductivity is:",
    options: ['MLT⁻³K⁻¹', 'ML²T⁻³K⁻¹', 'MLT⁻²K⁻¹', 'M²LT⁻³K⁻¹'],
    correctAnswer: 0,
    topic: "Units and Dimensions",
    subject: "Physics",
    difficulty: "Medium",
    year: "2022"
  },
  {
    id: "Q040",
    text: "Newton-second is the unit of:",
    options: ['Velocity', 'Angular momentum', 'Momentum', 'Energy'],
    correctAnswer: 2,
    topic: "Units and Dimensions",
    subject: "Physics",
    difficulty: "Easy",
    year: "2022"
  },
  {
    id: "Q041",
    text: "One nanometre is equal to:",
    options: ['10⁹ mm', '10⁻⁶ cm', '10⁻⁷ cm', '10⁻⁹ cm'],
    correctAnswer: 2,
    topic: "Units and Dimensions",
    subject: "Physics",
    difficulty: "Easy",
    year: "2022"
  },
  {
    id: "Q042",
    text: "Average molar kinetic energy of CO and N₂ at same temperature is:",
    options: ['KE₁ < KE₂', 'KE₁ > KE₂', 'KE₁ = KE₂', 'Insufficient information'],
    correctAnswer: 2,
    topic: "Kinetic Theory",
    subject: "Chemistry",
    difficulty: "Medium",
    year: "2022"
  },
  {
    id: "Q043",
    text: "A jar with a pinhole has equal moles of O₂ and H₂. What fraction of O₂ releases when 1/4th of H₂ is released?",
    options: ['1/4th', '1/2th', '3/8th', '1/8th'],
    correctAnswer: 3,
    topic: "Kinetic Theory",
    subject: "Chemistry",
    difficulty: "Hard",
    year: "2022"
  },
  {
    id: "Q044",
    text: "If equal solutions are equimolar, which will have the highest pH?",
    options: ['BaCl₂', 'LiCl', 'AlCl₃', 'BeCl₂'],
    correctAnswer: 0,
    topic: "Ionic Equilibrium",
    subject: "Chemistry",
    difficulty: "Medium",
    year: "2022"
  },
  {
    id: "Q045",
    text: "In photosynthesis, the light-dependent reactions occur in:",
    options: ['Stroma', 'Thylakoids', 'Cytoplasm', 'Nucleus'],
    correctAnswer: 1,
    topic: "Photosynthesis",
    subject: "Biology",
    difficulty: "Easy",
    year: "2022"
  },
  {
    id: "Q046",
    text: "Which enzyme is involved in DNA replication?",
    options: ['DNA ligase', 'DNA polymerase', 'DNA helicase', 'All of the above'],
    correctAnswer: 3,
    topic: "Molecular Biology",
    subject: "Biology",
    difficulty: "Medium",
    year: "2022"
  },
  {
    id: "Q047",
    text: "The hormone responsible for milk ejection is:",
    options: ['Prolactin', 'Oxytocin', 'Growth hormone', 'FSH'],
    correctAnswer: 1,
    topic: "Chemical Coordination",
    subject: "Biology",
    difficulty: "Easy",
    year: "2022"
  },
  {
    id: "Q048",
    text: "In which part of nephron does maximum reabsorption occur?",
    options: ['Glomerulus', "Bowman's capsule", 'Proximal convoluted tubule', 'Distal convoluted tubule'],
    correctAnswer: 2,
    topic: "Excretion",
    subject: "Biology",
    difficulty: "Medium",
    year: "2022"
  },
  {
    id: "Q049",
    text: "The cross-bridge cycle in muscle contraction requires:",
    options: ['ATP only', 'Calcium only', 'Both ATP and Calcium', 'Neither ATP nor Calcium'],
    correctAnswer: 2,
    topic: "Locomotion and Movement",
    subject: "Biology",
    difficulty: "Medium",
    year: "2022"
  },
  {
    id: "Q050",
    text: "Which type of biodiversity is most important for ecosystem stability?",
    options: ['Genetic diversity', 'Species diversity', 'Ecosystem diversity', 'All are equally important'],
    correctAnswer: 3,
    topic: "Biodiversity",
    subject: "Biology",
    difficulty: "Hard",
    year: "2022"
  }
];


export const populateDatabase = async () => {
  try {
    console.log('Inserting questions...')
    const result = await insertQuestions(sampleQuestions)
    console.log(`Successfully inserted ${result.length} questions`)
    return result
  } catch (error) {
    console.error('Failed to populate database:', error)
    throw error
  }
}

export default populateDatabase;

// Run this function once to populate your database
// You can call this from a component or create a script
