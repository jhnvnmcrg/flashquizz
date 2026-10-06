import type { TaxonomyImport } from '../src/lib/schemas/taxonomy.ts'

/**
 * PhLE module → subject → topic taxonomy. Seeded by scripts/seed.ts and
 * editable afterwards in /admin/taxonomy. Topic slugs are globally unique and
 * are what the extraction pipeline writes into `topicSlug`.
 */
export const taxonomy: TaxonomyImport = {
  modules: [
    {
      slug: 'm1',
      code: 'M1',
      name: 'Pharmaceutical Chemistry',
      shortName: 'Pharm Chem',
      description:
        'General, organic, medicinal and inorganic pharmaceutical chemistry, plus qualitative analysis.',
      accentHue: 290,
      subjects: [
        {
          slug: 'm1-pharm-chem',
          name: 'Pharmaceutical Chemistry',
          topics: [
            { slug: 'm1-general-chem', name: 'General & Physical Chemistry' },
            { slug: 'm1-organic-chem', name: 'Organic Chemistry' },
            { slug: 'm1-medicinal-chem', name: 'Medicinal Chemistry (Structure, SAR, Metabolism)' },
            { slug: 'm1-inorganic-chem', name: 'Inorganic Pharmaceutical Chemistry' },
            { slug: 'm1-radiopharma-gases', name: 'Medical Gases & Radiopharmaceuticals' },
            { slug: 'm1-qualitative-analysis', name: 'Qualitative Analysis' },
          ],
        },
      ],
    },
    {
      slug: 'm2',
      code: 'M2',
      name: 'Biochemistry & Pharmacognosy',
      shortName: 'Biochem & Pcog',
      description: 'Pharmaceutical biochemistry, pharmacognosy and plant chemistry.',
      accentHue: 135,
      subjects: [
        {
          slug: 'm2-biochemistry',
          name: 'Biochemistry',
          topics: [
            { slug: 'm2-cell-biology', name: 'Cell Biology' },
            { slug: 'm2-proteins', name: 'Proteins & Amino Acids' },
            { slug: 'm2-enzymes-vitamins', name: 'Enzymes, Coenzymes & Vitamins' },
            { slug: 'm2-carbohydrates', name: 'Carbohydrates' },
            { slug: 'm2-lipids', name: 'Lipids' },
            { slug: 'm2-nucleic-acids', name: 'Nucleic Acids & Molecular Biology' },
            { slug: 'm2-metabolism', name: 'Metabolism & Bioenergetics' },
            { slug: 'm2-inborn-errors', name: 'Inborn Errors & Clinical Biochemistry' },
          ],
        },
        {
          slug: 'm2-pharmacognosy',
          name: 'Pharmacognosy & Plant Chemistry',
          topics: [
            { slug: 'm2-crude-drugs', name: 'Crude Drugs & General Pharmacognosy' },
            { slug: 'm2-biosynthesis', name: 'Biosynthetic Pathways' },
            { slug: 'm2-carbohydrate-drugs', name: 'Carbohydrate Drugs & Gums' },
            { slug: 'm2-fixed-oils', name: 'Fixed Oils, Fats & Waxes' },
            { slug: 'm2-volatile-oils', name: 'Volatile Oils' },
            { slug: 'm2-resins', name: 'Resins & Resin Combinations' },
            { slug: 'm2-alkaloids', name: 'Alkaloids' },
            { slug: 'm2-glycosides', name: 'Glycosides' },
            { slug: 'm2-tannins', name: 'Tannins & Miscellaneous Constituents' },
            { slug: 'm2-ph-medicinal-plants', name: 'Philippine Medicinal Plants' },
          ],
        },
      ],
    },
    {
      slug: 'm3',
      code: 'M3',
      name: 'Pharmacy Practice',
      shortName: 'Pharmacy Practice',
      description:
        'Dispensing, clinical and hospital pharmacy, drug interactions and pharmaceutical calculations.',
      accentHue: 220,
      subjects: [
        {
          slug: 'm3-dispensing',
          name: 'Dispensing & Pharmaceutical Care',
          topics: [
            { slug: 'm3-prescriptions', name: 'Prescriptions & Dispensing' },
            { slug: 'm3-pharmacotherapy', name: 'Pharmacotherapy & OTC Counselling' },
            { slug: 'm3-interactions', name: 'Drug Interactions & Incompatibilities' },
            { slug: 'm3-adr-safety', name: 'ADRs & Drug Safety' },
          ],
        },
        {
          slug: 'm3-clinical-hospital',
          name: 'Clinical & Hospital Pharmacy',
          topics: [
            { slug: 'm3-clinical-lab', name: 'Clinical Lab Values & Pathophysiology' },
            { slug: 'm3-hospital-pharmacy', name: 'Hospital Pharmacy, Drug Info & Pharmacoeconomics' },
          ],
        },
        {
          slug: 'm3-calculations',
          name: 'Pharmaceutical Calculations',
          topics: [{ slug: 'm3-pharm-calc', name: 'Pharmaceutical Calculations' }],
        },
      ],
    },
    {
      slug: 'm4',
      code: 'M4',
      name: 'Pharmacology & Toxicology',
      shortName: 'Pharmacology',
      description: 'Pharmacodynamics, pharmacokinetics, systemic pharmacology and toxicology.',
      accentHue: 25,
      subjects: [
        {
          slug: 'm4-pharmacology',
          name: 'Pharmacology',
          topics: [
            { slug: 'm4-general-principles', name: 'General Principles (PD/PK)' },
            { slug: 'm4-autonomic', name: 'Autonomic Nervous System' },
            { slug: 'm4-cardiovascular', name: 'Cardiovascular & Renal' },
            { slug: 'm4-blood', name: 'Blood & Hematologic Drugs' },
            { slug: 'm4-lipids', name: 'Lipid-Lowering Drugs' },
            { slug: 'm4-autacoids', name: 'Autacoids' },
            { slug: 'm4-endocrine', name: 'Endocrine' },
            { slug: 'm4-analgesics', name: 'Analgesics, NSAIDs & Steroids' },
            { slug: 'm4-cns', name: 'Central Nervous System' },
            { slug: 'm4-respiratory', name: 'Respiratory' },
            { slug: 'm4-gi', name: 'Gastrointestinal' },
            { slug: 'm4-chemotherapy', name: 'Chemotherapy (Antimicrobial & Antineoplastic)' },
          ],
        },
        {
          slug: 'm4-toxicology',
          name: 'Toxicology',
          topics: [{ slug: 'm4-toxicology-antidotes', name: 'Toxicology & Antidotes' }],
        },
      ],
    },
    {
      slug: 'm5',
      code: 'M5',
      name: 'Pharmaceutics, Manufacturing & Jurisprudence',
      shortName: 'Pharmaceutics & Law',
      description:
        'Physical pharmacy, dosage forms, manufacturing, cosmetics regulation, and pharmacy laws & ethics.',
      accentHue: 75,
      subjects: [
        {
          slug: 'm5-pharmaceutics',
          name: 'Pharmaceutics & Manufacturing',
          topics: [
            { slug: 'm5-physical-pharmacy', name: 'Physical Pharmacy' },
            { slug: 'm5-dosage-forms', name: 'Dosage Forms & Drug Delivery' },
            { slug: 'm5-manufacturing', name: 'Manufacturing & Industrial Pharmacy' },
          ],
        },
        {
          slug: 'm5-jurisprudence',
          name: 'Pharmacy Laws & Ethics',
          topics: [
            { slug: 'm5-cosmetics', name: 'Cosmetics & Product Regulation' },
            { slug: 'm5-laws-ethics', name: 'Pharmacy Laws & Ethics' },
          ],
        },
      ],
    },
    {
      slug: 'm6',
      code: 'M6',
      name: 'Microbiology, QA/QC & Analysis',
      shortName: 'Micro & QA/QC',
      description:
        'Microbiology, immunology, parasitology, pharmaceutical analysis, and quality assurance / drug testing.',
      accentHue: 340,
      subjects: [
        {
          slug: 'm6-microbiology',
          name: 'Microbiology & Parasitology',
          topics: [
            { slug: 'm6-micro-general', name: 'General Microbiology & Epidemiology' },
            { slug: 'm6-immunology', name: 'Immunology' },
            { slug: 'm6-bacteriology', name: 'Bacteriology' },
            { slug: 'm6-virology', name: 'Virology' },
            { slug: 'm6-mycology', name: 'Mycology' },
            { slug: 'm6-antimicrobials', name: 'Sterilization, Disinfection & Antimicrobials' },
            { slug: 'm6-parasitology', name: 'Parasitology' },
          ],
        },
        {
          slug: 'm6-analysis',
          name: 'Pharmaceutical Analysis',
          topics: [
            { slug: 'm6-volumetric', name: 'Volumetric & Gravimetric Analysis' },
            { slug: 'm6-instrumental', name: 'Instrumental Analysis' },
            { slug: 'm6-special-assays', name: 'Special Assays (Oils, Crude Drugs, etc.)' },
          ],
        },
        {
          slug: 'm6-qa-qc',
          name: 'Quality Assurance & Drug Testing',
          topics: [{ slug: 'm6-qa-qc', name: 'Quality Assurance & Quality Control' }],
        },
      ],
    },
  ],
  sources: [
    { slug: 'pb1', name: 'Pre-board 1', shortName: 'PB1' },
    { slug: 'm2fc', name: 'M2 Final Coaching', shortName: 'M2 FC' },
    { slug: 'm6fc', name: 'M6 Final Coaching', shortName: 'M6 FC' },
    { slug: 'm4pt', name: 'M4 Post-test', shortName: 'M4 PT' },
    { slug: 'm3fc', name: 'M3 Final Coaching', shortName: 'M3 FC' },
    { slug: 'm1fpb', name: 'M1 Final Pre-board', shortName: 'M1 FPB' },
    { slug: 'm3fpb', name: 'M3 Final Pre-board', shortName: 'M3 FPB' },
    { slug: 'm4fpr', name: 'M4 Final Pre-board', shortName: 'M4 FPR' },
    { slug: 'm4drill', name: 'M4 Drill 1', shortName: 'M4 Drill' },
    { slug: 'm5notes', name: 'Module 5 annotated questionnaire', shortName: 'M5 Notes' },
    { slug: 'calc', name: 'Pharmaceutical Calculations Handout', shortName: 'Calc' },
    { slug: 'notes', name: 'Reviewer reference notes', shortName: 'Notes' },
    { slug: 'm4compre', name: 'M4 Comprehensive Exam', shortName: 'M4 Compre' },
    { slug: 'm4modular', name: 'M4 Modular Exam', shortName: 'M4 Modular' },
    { slug: 'm2fpb', name: 'M2 Final Pre-board', shortName: 'M2 FPB' },
    { slug: 'm5fpb', name: 'M5 Final Pre-board', shortName: 'M5 FPB' },
    { slug: 'm6fpb', name: 'M6 Final Pre-board', shortName: 'M6 FPB' },
    { slug: 'lectures', name: 'Lecture notes', shortName: 'Lectures' },
    { slug: 'm1fc', name: 'M1 Final Coaching', shortName: 'M1 FC' },
    { slug: 'm4fc', name: 'M4 Final Coaching', shortName: 'M4 FC' },
    { slug: 'm5fc', name: 'M5 Final Coaching', shortName: 'M5 FC' },
    { slug: 'm1compre', name: 'M1 Comprehensive Exam', shortName: 'M1 Compre' },
    { slug: 'm2compre', name: 'M2 Comprehensive Exam', shortName: 'M2 Compre' },
    { slug: 'm3compre', name: 'M3 Comprehensive Exam', shortName: 'M3 Compre' },
    { slug: 'm5compre', name: 'M5 Comprehensive Exam', shortName: 'M5 Compre' },
    { slug: 'm6compre', name: 'M6 Comprehensive Exam', shortName: 'M6 Compre' },
    { slug: 'm1drill', name: 'M1 Drills', shortName: 'M1 Drill' },
    { slug: 'm2drill', name: 'M2 Drills', shortName: 'M2 Drill' },
    { slug: 'm3drill', name: 'M3 Drills', shortName: 'M3 Drill' },
    { slug: 'm5drill', name: 'M5 Drills', shortName: 'M5 Drill' },
    { slug: 'm6drill', name: 'M6 Drills', shortName: 'M6 Drill' },
    { slug: 'fpbapr', name: 'Final Pre-boards (April 2026)', shortName: 'FPB Apr' },
    { slug: 'n24drill', name: 'November 2024 Drills', shortName: 'Nov24 Drill' },
    { slug: 'n24compre', name: 'November 2024 Comprehensive Exam', shortName: 'Nov24 Compre' },
    { slug: 'n24pb', name: 'November 2024 Pre-board', shortName: 'Nov24 PB' },
    { slug: 'n24fpb', name: 'November 2024 Final Pre-board', shortName: 'Nov24 FPB' },
    { slug: 'manual', name: 'Added manually', shortName: 'Manual' },
  ],
}
