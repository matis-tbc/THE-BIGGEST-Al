import { mergeTemplate } from './src/utils/templateMerge.js';

const contact = {
    name: "Deidra Tucker",
    email: "deidra@example.com",
    Company: "Kilduff Underground",
    Member: "Matis Uhl",
    'Sender Name': "Matis Uhl de Morais",
    'Sender Role': "Systems",
    'Sender Major': "Engineering",
    'Sender Phone': "123-456",
    'Sender Email': "matis@example.com"
};

const template = `Hello {{First Name}},

My name is {{Sender Name}}, and I’m with CU Hyperloop, a student engineering team at the University of Colorado Boulder that designs and builds a fully functional tunnel boring machine each year. Our 12-foot, 2,000-pound TBM earned 2nd place globally at The Boring Company’s Not-A-Boring Competition, and we’re continuing to push boundaries in tunneling innovation.

We are reaching out to {{Company}} because we believe there is a profound technical alignment between your industry-defining expertise in tunneling and our mission to innovate within the trenchless sector.`;

console.log("--- MERGED TEMPLATE ---");
console.log(mergeTemplate(template, contact));
