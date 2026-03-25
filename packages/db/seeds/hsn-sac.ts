import type { Db } from '../src/client';
import { hsnSacCodes } from '../src/schema/masters/hsn-sac';

interface HsnSacSeed {
  code: string;
  type: 'hsn' | 'sac';
  description: string;
  gstRate: string | null;
}

/**
 * Top HSN codes covering common Indian SME trading/manufacturing categories.
 * Rates as of 2024 — may vary by notification.
 */
const HSN_CODES: HsnSacSeed[] = [
  // Food & Agricultural (Chapter 1-21)
  { code: '0401', type: 'hsn', description: 'Milk and cream, not concentrated', gstRate: '0.00' },
  { code: '0402', type: 'hsn', description: 'Milk and cream, concentrated or sweetened', gstRate: '5.00' },
  { code: '0406', type: 'hsn', description: 'Cheese and curd', gstRate: '12.00' },
  { code: '0702', type: 'hsn', description: 'Tomatoes, fresh or chilled', gstRate: '0.00' },
  { code: '0713', type: 'hsn', description: 'Dried leguminous vegetables (pulses)', gstRate: '0.00' },
  { code: '0901', type: 'hsn', description: 'Coffee (roasted or not)', gstRate: '5.00' },
  { code: '0902', type: 'hsn', description: 'Tea', gstRate: '5.00' },
  { code: '1001', type: 'hsn', description: 'Wheat and meslin', gstRate: '0.00' },
  { code: '1005', type: 'hsn', description: 'Maize (corn)', gstRate: '0.00' },
  { code: '1006', type: 'hsn', description: 'Rice', gstRate: '5.00' },
  { code: '1101', type: 'hsn', description: 'Wheat or meslin flour (atta)', gstRate: '0.00' },
  { code: '1507', type: 'hsn', description: 'Soya-bean oil', gstRate: '5.00' },
  { code: '1511', type: 'hsn', description: 'Palm oil and its fractions', gstRate: '5.00' },
  { code: '1701', type: 'hsn', description: 'Cane or beet sugar', gstRate: '5.00' },
  { code: '1901', type: 'hsn', description: 'Malt extract; food preparations of flour', gstRate: '18.00' },
  { code: '1905', type: 'hsn', description: 'Bread, pastry, cakes, biscuits', gstRate: '18.00' },
  { code: '2106', type: 'hsn', description: 'Food preparations not elsewhere specified', gstRate: '18.00' },
  { code: '2201', type: 'hsn', description: 'Waters, mineral and aerated', gstRate: '18.00' },
  { code: '2202', type: 'hsn', description: 'Sweetened or flavoured water/beverages', gstRate: '28.00' },

  // Chemicals, Pharma & Cosmetics (Chapter 28-33)
  { code: '3003', type: 'hsn', description: 'Medicaments (not in dosage form)', gstRate: '12.00' },
  { code: '3004', type: 'hsn', description: 'Medicaments in measured doses', gstRate: '12.00' },
  { code: '3303', type: 'hsn', description: 'Perfumes and toilet waters', gstRate: '28.00' },
  { code: '3304', type: 'hsn', description: 'Beauty/make-up preparations', gstRate: '28.00' },
  { code: '3305', type: 'hsn', description: 'Hair care preparations (shampoo etc.)', gstRate: '18.00' },
  { code: '3306', type: 'hsn', description: 'Oral/dental hygiene preparations', gstRate: '18.00' },
  { code: '3401', type: 'hsn', description: 'Soap and organic surface-active products', gstRate: '18.00' },
  { code: '3402', type: 'hsn', description: 'Washing and cleaning preparations (detergents)', gstRate: '18.00' },

  // Plastics & Rubber (Chapter 39-40)
  { code: '3923', type: 'hsn', description: 'Plastic articles for packing (bottles, caps)', gstRate: '18.00' },
  { code: '3926', type: 'hsn', description: 'Other articles of plastics', gstRate: '18.00' },
  { code: '4011', type: 'hsn', description: 'New pneumatic tyres, of rubber', gstRate: '28.00' },

  // Paper & Printing (Chapter 48-49)
  { code: '4802', type: 'hsn', description: 'Uncoated paper for writing/printing', gstRate: '12.00' },
  { code: '4819', type: 'hsn', description: 'Cartons, boxes, cases of paper/paperboard', gstRate: '18.00' },
  { code: '4820', type: 'hsn', description: 'Registers, notebooks, diaries', gstRate: '18.00' },
  { code: '4901', type: 'hsn', description: 'Printed books, brochures', gstRate: '0.00' },
  { code: '4911', type: 'hsn', description: 'Other printed matter (labels, cards)', gstRate: '12.00' },

  // Textiles & Garments (Chapter 50-63)
  { code: '5208', type: 'hsn', description: 'Woven fabrics of cotton', gstRate: '5.00' },
  { code: '5209', type: 'hsn', description: 'Woven fabrics of cotton (>=200g/m²)', gstRate: '5.00' },
  { code: '5407', type: 'hsn', description: 'Woven fabrics of synthetic filament yarn', gstRate: '5.00' },
  { code: '6101', type: 'hsn', description: 'Knitted overcoats/jackets (men)', gstRate: '12.00' },
  { code: '6109', type: 'hsn', description: 'T-shirts, singlets, knitted', gstRate: '12.00' },
  { code: '6203', type: 'hsn', description: 'Suits, trousers, shorts (men, not knitted)', gstRate: '12.00' },
  { code: '6204', type: 'hsn', description: 'Suits, dresses, skirts (women, not knitted)', gstRate: '12.00' },

  // Iron, Steel & Metals (Chapter 72-83)
  { code: '7210', type: 'hsn', description: 'Flat-rolled iron/steel, coated', gstRate: '18.00' },
  { code: '7213', type: 'hsn', description: 'Hot-rolled bars/rods of iron/steel', gstRate: '18.00' },
  { code: '7306', type: 'hsn', description: 'Tubes and pipes of iron/steel', gstRate: '18.00' },
  { code: '7318', type: 'hsn', description: 'Screws, bolts, nuts, washers', gstRate: '18.00' },
  { code: '7323', type: 'hsn', description: 'Iron/steel utensils (household)', gstRate: '18.00' },
  { code: '7610', type: 'hsn', description: 'Aluminium structures and parts', gstRate: '18.00' },
  { code: '7615', type: 'hsn', description: 'Aluminium utensils (household)', gstRate: '12.00' },

  // Machinery & Electronics (Chapter 84-85)
  { code: '8414', type: 'hsn', description: 'Air/vacuum pumps, compressors, fans', gstRate: '18.00' },
  { code: '8415', type: 'hsn', description: 'Air conditioning machines', gstRate: '28.00' },
  { code: '8418', type: 'hsn', description: 'Refrigerators, freezers', gstRate: '18.00' },
  { code: '8422', type: 'hsn', description: 'Dish washing, packaging, filling machines', gstRate: '18.00' },
  { code: '8443', type: 'hsn', description: 'Printing/copying machines (printers)', gstRate: '18.00' },
  { code: '8471', type: 'hsn', description: 'Computers and processing units', gstRate: '18.00' },
  { code: '8504', type: 'hsn', description: 'Electrical transformers, power supplies', gstRate: '18.00' },
  { code: '8507', type: 'hsn', description: 'Electric accumulators (batteries)', gstRate: '28.00' },
  { code: '8517', type: 'hsn', description: 'Telephone sets, smartphones', gstRate: '18.00' },
  { code: '8523', type: 'hsn', description: 'Discs, tapes, storage media', gstRate: '18.00' },
  { code: '8528', type: 'hsn', description: 'Monitors, projectors, TVs', gstRate: '28.00' },
  { code: '8536', type: 'hsn', description: 'Switches, plugs, sockets, connectors', gstRate: '28.00' },
  { code: '8539', type: 'hsn', description: 'Electric lamps (LED, filament)', gstRate: '18.00' },
  { code: '8544', type: 'hsn', description: 'Insulated wire, cable, optical fibre', gstRate: '18.00' },

  // Vehicles (Chapter 87)
  { code: '8703', type: 'hsn', description: 'Motor cars and vehicles for transport', gstRate: '28.00' },
  { code: '8711', type: 'hsn', description: 'Motorcycles and cycles with motor', gstRate: '28.00' },
  { code: '8714', type: 'hsn', description: 'Parts and accessories of motor vehicles', gstRate: '28.00' },

  // Furniture & Miscellaneous (Chapter 94-96)
  { code: '9401', type: 'hsn', description: 'Seats and chairs (office, household)', gstRate: '18.00' },
  { code: '9403', type: 'hsn', description: 'Other furniture (desks, cabinets)', gstRate: '18.00' },
  { code: '9405', type: 'hsn', description: 'Lamps and lighting fittings', gstRate: '18.00' },
  { code: '9503', type: 'hsn', description: 'Toys, puzzles, games', gstRate: '12.00' },
  { code: '9608', type: 'hsn', description: 'Ball point pens, felt-tipped pens', gstRate: '18.00' },
  { code: '9619', type: 'hsn', description: 'Sanitary pads, diapers', gstRate: '12.00' },

  // Cement, Ceramics, Glass (Chapter 68-70)
  { code: '6802', type: 'hsn', description: 'Worked stone (marble, granite)', gstRate: '28.00' },
  { code: '6907', type: 'hsn', description: 'Ceramic tiles and flags', gstRate: '18.00' },
  { code: '7005', type: 'hsn', description: 'Float glass and surface ground glass', gstRate: '18.00' },
  { code: '2523', type: 'hsn', description: 'Portland cement, aluminous cement', gstRate: '28.00' },

  // Fuel & Petroleum (Chapter 27)
  { code: '2710', type: 'hsn', description: 'Petroleum oils (diesel, petrol)', gstRate: null },
  { code: '2711', type: 'hsn', description: 'Petroleum gases (LPG)', gstRate: '5.00' },
];

/**
 * Top SAC codes covering common Indian SME service categories.
 */
const SAC_CODES: HsnSacSeed[] = [
  // IT & Software
  { code: '998311', type: 'sac', description: 'IT consulting and support services', gstRate: '18.00' },
  { code: '998312', type: 'sac', description: 'IT design and development services', gstRate: '18.00' },
  { code: '998313', type: 'sac', description: 'IT infrastructure management services', gstRate: '18.00' },
  { code: '998314', type: 'sac', description: 'IT infrastructure provisioning services', gstRate: '18.00' },
  { code: '998315', type: 'sac', description: 'Hosting and IT infrastructure provisioning', gstRate: '18.00' },
  { code: '998316', type: 'sac', description: 'Software licensing services', gstRate: '18.00' },

  // Accounting & Legal
  { code: '998221', type: 'sac', description: 'Financial auditing services', gstRate: '18.00' },
  { code: '998222', type: 'sac', description: 'Accounting and bookkeeping services', gstRate: '18.00' },
  { code: '998223', type: 'sac', description: 'Tax consultancy and preparation services', gstRate: '18.00' },
  { code: '998211', type: 'sac', description: 'Legal advisory and representation services', gstRate: '18.00' },

  // Management Consulting
  { code: '998231', type: 'sac', description: 'Management consulting services', gstRate: '18.00' },
  { code: '998232', type: 'sac', description: 'Business consulting services', gstRate: '18.00' },

  // Advertising & Marketing
  { code: '998361', type: 'sac', description: 'Advertising services', gstRate: '18.00' },
  { code: '998362', type: 'sac', description: 'Purchase or sale of advertising space', gstRate: '18.00' },
  { code: '998363', type: 'sac', description: 'Sale of advertising space on commission', gstRate: '18.00' },

  // Transport & Logistics
  { code: '996511', type: 'sac', description: 'Road transport of goods (GTA)', gstRate: '5.00' },
  { code: '996512', type: 'sac', description: 'Road transport of goods by other than GTA', gstRate: '18.00' },
  { code: '996521', type: 'sac', description: 'Rail transport of goods', gstRate: '5.00' },
  { code: '996601', type: 'sac', description: 'Courier services', gstRate: '18.00' },
  { code: '996711', type: 'sac', description: 'Cargo handling services', gstRate: '18.00' },
  { code: '996721', type: 'sac', description: 'Storage and warehousing of goods', gstRate: '18.00' },

  // Real Estate & Construction
  { code: '995411', type: 'sac', description: 'Construction of residential buildings', gstRate: '12.00' },
  { code: '995421', type: 'sac', description: 'Construction of commercial buildings', gstRate: '18.00' },
  { code: '997211', type: 'sac', description: 'Rental of residential property', gstRate: null },
  { code: '997212', type: 'sac', description: 'Rental of commercial property', gstRate: '18.00' },

  // Hospitality & Food Service
  { code: '996331', type: 'sac', description: 'Restaurant services (without AC)', gstRate: '5.00' },
  { code: '996332', type: 'sac', description: 'Restaurant services (with AC)', gstRate: '5.00' },
  { code: '996311', type: 'sac', description: 'Hotel accommodation (tariff < ₹1000)', gstRate: '12.00' },
  { code: '996312', type: 'sac', description: 'Hotel accommodation (tariff ₹1000-₹7500)', gstRate: '12.00' },
  { code: '996313', type: 'sac', description: 'Hotel accommodation (tariff > ₹7500)', gstRate: '18.00' },

  // Education & Training
  { code: '999210', type: 'sac', description: 'Pre-primary and primary education', gstRate: null },
  { code: '999220', type: 'sac', description: 'Secondary education', gstRate: null },
  { code: '999230', type: 'sac', description: 'Higher education', gstRate: null },
  { code: '999293', type: 'sac', description: 'Commercial training/coaching', gstRate: '18.00' },

  // Healthcare
  { code: '999311', type: 'sac', description: 'Human health services (hospitals)', gstRate: null },
  { code: '999312', type: 'sac', description: 'Medical and dental services', gstRate: null },

  // Repair & Maintenance
  { code: '998711', type: 'sac', description: 'Maintenance and repair of motor vehicles', gstRate: '18.00' },
  { code: '998714', type: 'sac', description: 'Maintenance and repair of machinery', gstRate: '18.00' },
  { code: '998716', type: 'sac', description: 'Maintenance and repair of computers', gstRate: '18.00' },

  // Financial Services
  { code: '997113', type: 'sac', description: 'Financial intermediation services', gstRate: '18.00' },
  { code: '997131', type: 'sac', description: 'Financial leasing services', gstRate: '18.00' },
  { code: '997133', type: 'sac', description: 'Insurance auxiliary services', gstRate: '18.00' },
  { code: '997159', type: 'sac', description: 'Other financial services', gstRate: '18.00' },

  // Manpower & HR
  { code: '998513', type: 'sac', description: 'Labour/manpower supply services', gstRate: '18.00' },
  { code: '998515', type: 'sac', description: 'Contract staffing services', gstRate: '18.00' },

  // Security & Cleaning
  { code: '998521', type: 'sac', description: 'Investigation and security services', gstRate: '18.00' },
  { code: '998531', type: 'sac', description: 'Cleaning services (general)', gstRate: '18.00' },

  // Telecom
  { code: '998412', type: 'sac', description: 'Fixed telephony services', gstRate: '18.00' },
  { code: '998413', type: 'sac', description: 'Mobile telephony services', gstRate: '18.00' },
  { code: '998414', type: 'sac', description: 'Internet access services', gstRate: '18.00' },

  // Printing & Publishing
  { code: '998912', type: 'sac', description: 'Printing services', gstRate: '18.00' },
  { code: '998921', type: 'sac', description: 'Publishing, licensing of printed works', gstRate: '18.00' },
];

export async function seedHsnSacCodes(db: Db): Promise<void> {
  const allCodes = [...HSN_CODES, ...SAC_CODES];

  console.log(`Seeding ${allCodes.length} HSN/SAC codes...`);

  // Insert in batches of 50 to avoid query size limits
  const BATCH_SIZE = 50;
  for (let i = 0; i < allCodes.length; i += BATCH_SIZE) {
    const batch = allCodes.slice(i, i + BATCH_SIZE);
    await db
      .insert(hsnSacCodes)
      .values(batch)
      .onConflictDoNothing({ target: hsnSacCodes.code });
  }

  console.log(`Seeded ${allCodes.length} HSN/SAC codes.`);
}
