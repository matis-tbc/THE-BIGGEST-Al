import { projectStore } from "../services/projectStore";

export const SEED_TEMPLATES = [
  {
    name: "Monetary Outreach - Digikey",
    content: `Subject: Partnership with CU Hyperloop\nTo: {{Email}}\n\nDear {{First Name}},\n\nMy name is {{Sender Name}}, and I am a part of CU Hyperloop, a dynamic student team at the University of Colorado Boulder that designs and builds an innovative tunnel boring machine every year. Our 12-ft long, 2000lb TBM designs previously earned us 2nd place in the world at The Boring Company’s Not-A-Boring Competition, and we are poised to push even further this year. We are reaching out because since the club’s beginning in 2017, Digikey has been one of the primary providers of electrical and mechanical components for our projects, and we believe you would be an invaluable partner for this year's success. \n\nBy providing this support, you would enable a team that is already deeply familiar with your product line to achieve global success. This support takes many forms, from in-kind donations of components and discounts to direct monetary sponsorship. In return, your partnership grants you exclusive recruitment access to our top engineers; prominent brand visibility with the Digikey logo on our TBM and all competition media; and alignment with a cutting-edge technical innovation project.\n\nAs a registered 501(c)(3), any sponsorship is tax-deductible. Attached is a detailed sponsorship deck outlining these benefits and tiers. Would you have any time this week for a brief call?\n\nSincerely,\n{{Sender Name}}\nCU Hyperloop | {{Sender Role}}\nCU Boulder | {{Sender Major}}\n{{Sender Phone}} | {{Sender Email}}`,
    subjects: [
      "CU Hyperloop // {{Company}}",
      "Partnership Opportunity - CU Hyperloop",
    ],
    variables: [
      "Name",
      "Email",
      "Sender Name",
      "Sender Role",
      "Sender Major",
      "Sender Phone",
      "Sender Email",
    ],
    category: "Monetary Outreach",
  },
  {
    name: "Monetary Outreach - Robbins",
    content: `Subject: Partnership with CU Hyperloop\nTo: {{Email}}\n\nDear {{First Name}},\n\nMy name is {{Sender Name}} with CU Hyperloop at the University of Colorado Boulder. As a student team dedicated to pushing the boundaries of autonomous tunneling, we have long looked to The Robbins Company as the ultimate benchmark for TBM engineering and grit.\n\nOur team designs and builds a 12-foot-long, 2,500lb TBM to compete on the world stage. Following our 2nd-place finish at The Boring Company’s Not-A-Boring Competition, we are currently engineering our next-generation machine. We are reaching out because we believe a partnership with Robbins would bridge the gap between your decades of industry-defining expertise and our student-led technical innovation.\n\nWhile our scale is smaller, our engineering challenges are remarkably similar to the ones Robbins solves globally. By supporting our team, you are directly fostering the next generation of engineers who are already familiar with problems related to cutterhead torque, thrust systems, and autonomous steering.\n\nIn return, Robbins would be given exclusive access to a pool of CU Boulder’s top engineering talent and prominent brand visibility with your logo.\n\nAs a registered 501(c)(3), any sponsorship is tax-deductible. I have attached our sponsorship deck, which outlines our technical goals and various partnership tiers.\n\nWould you be open to a brief call this week to discuss how we can represent Robbins at this year’s competition?\n\nSincerely,\n{{Sender Name}}\nCU Hyperloop | {{Sender Role}}\nCU Boulder | {{Sender Major}}\n{{Sender Phone}} | {{Sender Email}}`,
    subjects: [
      "CU Hyperloop // {{Company}}",
      "Partnership Opportunity - CU Hyperloop",
    ],
    variables: [
      "Name",
      "Email",
      "Sender Name",
      "Sender Role",
      "Sender Major",
      "Sender Phone",
      "Sender Email",
    ],
    category: "Monetary Outreach",
  },
  {
    name: "Monetary Outreach - General Tunneling 1",
    content: `Subject: Partnership with CU Hyperloop\nTo: {{Email}}\n\nHello {{First Name}},\n\nMy name is {{Sender Name}}, and I’m with CU Hyperloop, a student engineering team at the University of Colorado Boulder that designs and builds a fully functional tunnel boring machine each year. Our 12-foot, 2,000-pound TBM earned 2nd place globally at The Boring Company’s Not-A-Boring Competition, and we’re continuing to push boundaries in tunneling innovation.\n\nWe are reaching out to {{Company}} because we believe there is a profound technical alignment between your industry-defining expertise in tunneling and our mission to innovate within the trenchless sector. Beyond a traditional sponsorship, we view this as a strategic investment in the future of the tunneling workforce. By supporting our design and testing efforts, you gain a direct pipeline to a curated group of high-performing engineers who are already solving real-world challenges in cutterhead torque, autonomous steering, and structural integrity. Your partnership would bridge the gap between classroom theory and the grit required for large-scale underground infrastructure, ensuring that the next generation of engineers is trained on the same standards of excellence that {{Company}} represents.\n\nAs a registered 501(c)(3) organization, all sponsorships are tax-deductible. I have attached our sponsorship packet, which outlines our technical milestones and specific partnership tiers.\n\nWould you be open to a brief call this week to discuss how we can represent {{Company}} at this year’s competition?\n\nBest regards,\n{{Sender Name}}\nCU Hyperloop | {{Sender Role}}\nCU Boulder | {{Sender Major}}\n{{Sender Phone}} | {{Sender Email}}`,
    subjects: [
      "CU Hyperloop // {{Company}}",
      "Partnership Opportunity - CU Hyperloop",
    ],
    variables: [
      "Name",
      "Company",
      "Email",
      "Sender Name",
      "Sender Role",
      "Sender Major",
      "Sender Phone",
      "Sender Email",
    ],
    category: "Monetary Outreach",
  },
  {
    name: "Monetary Outreach - Skanska",
    content: `Subject: Partnership with CU Hyperloop\nTo: {{Email}}\n\nHello Skanska Team,\n\nMy name is {{Sender Name}}, and I’m with CU Hyperloop, a premier student engineering team at the University of Colorado Boulder. We design, manufacture, and operate a fully autonomous Tunnel Boring Machine (TBM) to compete in The Boring Company’s international Not-A-Boring Competition.\n\nI am reaching out because Skanska’s global leadership in complex infrastructure and commitment to sustainable construction deeply resonates with our mission. We are currently seeking monetary sponsorship to fuel our 2026–2027 development cycle, and we believe there is a powerful alignment between our hands-on research and your dedication to "building for a better society."\n\nOur team consists of approximately 50–70 student engineers who manage the entire lifecycle of a 2,000 lb, 12-foot-long TBM. We don't just design on paper, we build hardware that competes at the highest global level. We are consistently ranked among the top teams globally, recently taking 2nd Place in the World and winning the Innovation Award for our unique propulsion system at the 2024 competition.\n\nAs a registered 501(c)(3), any sponsorship is tax-deductible. I have attached our sponsorship deck, which outlines our technical goals and various partnership tiers.\n\nWould you be open to a short call this week to discuss how Skanska can help us pave the way for a more efficient and sustainable future? If you are not the best contact for sponsorship inquiries, I would greatly appreciate it if you could point me toward the right person.\n\nThank you for your time and for supporting the next generation of engineers.\n\n{{Sender Name}}\nCU Hyperloop | {{Sender Role}}\nCU Boulder | {{Sender Major}}\n{{Sender Phone}} | {{Sender Email}}`,
    subjects: [
      "CU Hyperloop // {{Company}}",
      "Partnership Opportunity - CU Hyperloop",
    ],
    variables: [
      "Email",
      "Sender Name",
      "Sender Role",
      "Sender Major",
      "Sender Phone",
      "Sender Email",
    ],
    category: "Monetary Outreach",
  },
  {
    name: "Monetary Outreach - 3M",
    content: `Subject: Partnership with CU Hyperloop\nTo: {{Email}}\n\nDear {{First Name}},\n\nMy name is {{Sender Name}}, and I am a part of CU Hyperloop, a student engineering team at the University of Colorado Boulder. Each year, we design and manufacture a 12-foot, 2,000-pound autonomous Tunnel Boring Machine (TBM) to compete on the global stage. After placing 2nd in the world at The Boring Company’s Not-A-Boring Competition, we are now focused on pushing the limits of material durability and system reliability.\n\nWe are reaching out to 3M because our TBM must maintain high precision while operating in challenging underground conditions. Our machine faces constant vibration and debris, requiring the kind of durable adhesives, coatings, and thermal management solutions that 3M pioneered. We believe your expertise in materials science is a natural fit for our project, as we look to improve the resilience and reliability of our systems for this year’s competition. By partnering with us, 3M is directly enabling a project that tests the boundaries of what your materials can achieve in the field.\n\nBeyond the technical application, this partnership offers 3M a direct connection to a group of CU Boulder’s top-tier engineers who are already applying 3M’s "Science. Applied to Life." philosophy to complex mechanical challenges.\n\nAs a registered 501(c)(3), all sponsorships are tax-deductible. I’ve attached our sponsorship packet, which outlines our 2025 design goals and various partnership tiers.\n\nWould you be open to a short call this week to discuss how 3M can help us engineer a more resilient machine for this year’s competition?\n\nBest regards,\n{{Sender Name}}\nCU Hyperloop | {{Sender Role}}\nCU Boulder | {{Sender Major}}\n{{Sender Phone}} | {{Sender Email}}`,
    subjects: [
      "CU Hyperloop // {{Company}}",
      "Partnership Opportunity - CU Hyperloop",
    ],
    variables: [
      "Name",
      "Email",
      "Sender Name",
      "Sender Role",
      "Sender Major",
      "Sender Phone",
      "Sender Email",
    ],
    category: "Monetary Outreach",
  },
  {
    name: "Monetary Outreach - Exxon",
    content: `Subject: Partnership with CU Hyperloop\nTo: {{Email}}\n\nHello ExxonMobil team,\n\nMy name is {{Sender Name}}, and I am a member of CU Hyperloop at the University of Colorado Boulder. We are a multidisciplinary, student-run engineering organization composed of approximately 40 undergraduate and graduate students. Each year, our team designs, builds, and tests a small-scale tunnel boring machine, managing the full project lifecycle from mechanical and electrical design to controls, software, PCB layout, and manufacturing.\n\nOur previous 12-foot, 2,000-pound TBM earned 2nd place globally in The Boring Company’s Not-A-Boring Competition and received the Innovation Award for our propulsion system. These achievements reflect both the technical depth of our team and our commitment to solving complex, real-world engineering challenges.\n\nGiven ExxonMobil’s leadership in large-scale engineering, infrastructure, and energy systems, we see strong alignment between your organization’s mission and our work. CU Hyperloop provides students with hands-on experience in systems engineering, project management, and applied problem-solving skills directly relevant to the work performed at ExxonMobil. A partnership would offer ExxonMobil exclusive access to motivated, highly capable engineering and business talent while supporting the development of next-generation technical leaders.\n\nWe are a registered 501(c)(3) organization meaning any contribution can be tax deductible. We also offer logo placement on our TBM and team apparel, and of course, recruitment access to our engineering and business talent, all outlined in the attached packet. \n\nWould you be open to a brief 20–30 minute conversation this week or next to discuss potential sponsorship opportunities?\n\nBest regards,\n{{Sender Name}}\nCU Hyperloop | {{Sender Role}}\nCU Boulder | {{Sender Major}}\n{{Sender Phone}} | {{Sender Email}}`,
    subjects: [
      "CU Hyperloop // {{Company}}",
      "Partnership Opportunity - CU Hyperloop",
    ],
    variables: [
      "Email",
      "Sender Name",
      "Sender Role",
      "Sender Major",
      "Sender Phone",
      "Sender Email",
    ],
    category: "Monetary Outreach",
  },
  {
    name: "Monetary Outreach - Delve Underground",
    content: `Subject: Partnership with CU Hyperloop\nTo: {{Email}}\n\nHello Delve Underground team, \n\nI'm {{Sender Name}} and I'm part of CU Hyperloop at the University of Colorado Boulder. Each year, our 40-member student engineering team designs and builds a small-scale tunnel-boring machine, handling everything from mechanical and electrical design to software, GNC, PCB layout, and manufacturing. Previously, our 12-ft, 2,000 lb TBM earned 2nd place globally in The Boring Company’s Not-A-Boring Competition and won the Innovation Award for our propulsion system. \n\nGiven Delve Underground’s industry leadership in tunnel design and underground engineering, we see a strong alignment between your team’s mission and ours. CU Hyperloop consists of CU Boulder’s most committed engineering students, dedicated to building the future of U.S tunneling technology. Through this project, our team is developing the very technical and problem-solving skillsets essential to the work you do. A partnership would give Delve Underground direct access to passionate, innovative, and highly capable emerging engineering talent. In return, we are seeking financial sponsorship and professional guidance to help us continue our trajectory of growth, creativity, and project success.\n\nWe are a registered 501(c)(3) organization, meaning any contribution can be tax-deductible. We also offer logo placement on our TBM and team apparel, and of course, recruitment access to our engineering and business talent, all outlined in the attached packet. Would you have 20–30 minutes this week or next to discuss this in more detail? \n\nBest regards,\n{{Sender Name}}\nCU Hyperloop | {{Sender Role}}\nCU Boulder | {{Sender Major}}\n{{Sender Phone}} | {{Sender Email}}`,
    subjects: [
      "CU Hyperloop // {{Company}}",
      "Partnership Opportunity - CU Hyperloop",
    ],
    variables: [
      "Email",
      "Sender Name",
      "Sender Role",
      "Sender Major",
      "Sender Phone",
      "Sender Email",
    ],
    category: "Monetary Outreach",
  },
  {
    name: "Monetary Outreach - Amtrak",
    content: `Subject: Partnership with CU Hyperloop\nTo: {{Email}}\n\nHello {{First Name}},\n\nMy name is {{Sender Name}}, and I’m with CU Hyperloop, a student engineering team at the University of Colorado Boulder that designs and builds a fully functional tunnel boring machine each year. Our 12-foot, 2,000-pound TBM earned 2nd place globally at The Boring Company’s Not-A-Boring Competition, and we’re continuing to push boundaries in tunneling innovation.\n\nWe are reaching out to you because we believe our mission aligns directly with Amtrak’s goals of modernization and operational excellence. By supporting our team, Amtrak is making a strategic investment in the future of the rail workforce. We provide a direct pipeline to high-performing engineers who are already solving complex challenges in tunneling automation, structural integrity, and remote monitoring—the exact skills required to deliver and maintain America's busiest rail corridors. Your partnership would bridge the gap between classroom theory and the grit required for large-scale underground infrastructure, ensuring that the next generation of engineers is trained on the same standards of excellence that Amtrak represents.\n\nAs a registered 501(c)(3) organization, all sponsorships are tax-deductible. I have attached our sponsorship packet, which outlines our technical milestones and specific partnership tiers.\n\nWould you be open to a brief call this week to discuss how we can represent Amtrak at this year’s competition?\n\nBest regards,\n{{Sender Name}}\nCU Hyperloop | {{Sender Role}}\nCU Boulder | {{Sender Major}}\n{{Sender Phone}} | {{Sender Email}}`,
    subjects: [
      "CU Hyperloop // {{Company}}",
      "Partnership Opportunity - CU Hyperloop",
    ],
    variables: [
      "Name",
      "Email",
      "Sender Name",
      "Sender Role",
      "Sender Major",
      "Sender Phone",
      "Sender Email",
    ],
    category: "Monetary Outreach",
  },
  {
    name: "Zayo Group",
    content: `Subject: CU Hyperloop // Zayo Group\nTo: {{Email}}\n\nHello {{First Name}},\n\nMy name is {{Sender Name}}, and I'm with <a href="https://cuhyperloop.org/home">CU Hyperloop</a>, a student engineering team at the University of Colorado Boulder. Each year, we design and build a fully functional tunnel boring machine. Our 13-foot, 2,500-pound TBM recently earned 2nd place globally at The Boring Company's Not-A-Boring Competition.\n\nWe are reaching out to Zayo Group because of your role in building and maintaining large-scale fiber infrastructure. While our project is centered on tunneling, the underlying challenges closely mirror those in underground network deployment - navigating subsurface conditions, managing installation constraints, and ensuring reliability in high-stakes environments. Our team operates at the intersection of civil construction and system integration, taking designs from concept to full-scale testing. This produces engineers who understand not just design, but deployment realities - an area that is often underrepresented in traditional academic training.\n\nSupporting CU Hyperloop is a direct investment in engineers with hands-on experience in underground infrastructure systems and field-driven problem solving.\n\nAs a registered 501(c)(3), all contributions are tax-deductible. I've attached our sponsorship packet with technical milestones and partnership options.\n\nWould you be open to a brief call this week to explore potential alignment with Zayo Group?\n\nBest regards,\n\n{{Sender Name}}\nCU Hyperloop | {{Sender Role}}\nCU Boulder | {{Sender Major}}\n{{Sender Phone}} | {{Sender Email}}`,
    subjects: ["CU Hyperloop // Zayo Group", "Partnership Opportunity - CU Hyperloop"],
    variables: ["First Name", "Email", "Sender Name", "Sender Role", "Sender Major", "Sender Phone", "Sender Email"],
    category: "Monetary Outreach",
  },
  {
    name: "Qorvo",
    content: `Subject: CU Hyperloop // Qorvo\nTo: {{Email}}\n\nHello {{First Name}},\n\nMy name is {{Sender Name}}, and I'm with <a href="https://cuhyperloop.org/home">CU Hyperloop</a> at the University of Colorado Boulder. We design and build a fully functional tunnel boring machine each year, integrating mechanical, electrical, and embedded control systems into a single operational platform. Our most recent 13-foot, 2,500-pound TBM just earned us 3rd place globally at The Boring Company's Not-A-Boring Competition.\n\nWe are reaching out to Qorvo because of your industry leadership in advanced power management, RF solutions, and robust sensor technologies. While our project is centered on tunneling, the underlying challenges closely mirror those in complex electronic system deployment, navigating extreme power constraints, integrating precise telemetry and MEMS sensors, and ensuring reliable communication in harsh, high-stakes environments. Our team operates at the intersection of civil construction and system integration, taking designs from concept to full-scale testing. This produces engineers who understand not just design, but deployment realities - an area that is often underrepresented in traditional academic training.\n\nSupporting CU Hyperloop is a direct investment in engineers with hands-on experience in underground infrastructure systems and field-driven problem solving.\n\nAs a registered 501(c)(3), all contributions are tax-deductible. I've attached our sponsorship packet with technical milestones and partnership options.\n\nWould you be open to a brief call this week to explore potential alignment with Qorvo?\n\nBest regards,\n\n{{Sender Name}}\nCU Hyperloop | {{Sender Role}}\nCU Boulder | {{Sender Major}}\n{{Sender Phone}} | {{Sender Email}}`,
    subjects: ["CU Hyperloop // Qorvo", "Partnership Opportunity - CU Hyperloop"],
    variables: ["First Name", "Email", "Sender Name", "Sender Role", "Sender Major", "Sender Phone", "Sender Email"],
    category: "Monetary Outreach",
  },
  {
    name: "Digikey",
    content: `Subject: Partnership with CU Hyperloop\nTo: {{Email}}\n\nDear {{First Name}},\n\nMy name is {{Sender Name}}, and I am a part of <a href="https://cuhyperloop.org/home">CU Hyperloop</a>, a dynamic student team at the University of Colorado Boulder that designs and builds an innovative tunnel boring machine every year. Our 12-ft long, 2000lb TBM designs previously earned us 2nd place in the world at The Boring Company's Not-A-Boring Competition, and we are poised to push even further this year. We are reaching out because since the club's beginning in 2017, Digikey has been one of the primary providers of electrical and mechanical components for our projects, and we believe you would be an invaluable partner for this year's success.\n\nBy providing this support, you would enable a team that is already deeply familiar with your product line to achieve global success. This support takes many forms, from in-kind donations of components and discounts to direct monetary sponsorship. In return, your partnership grants you exclusive recruitment access to our top engineers; prominent brand visibility with the Digikey logo on our TBM and all competition media; and alignment with a cutting-edge technical innovation project.\n\nAs a registered 501(c)(3), any sponsorship is tax-deductible. Attached is a detailed sponsorship deck outlining these benefits and tiers. Would you have any time this week for a brief call?\n\nSincerely,\n\n{{Sender Name}}\nCU Hyperloop | {{Sender Role}}\nCU Boulder | {{Sender Major}}\n{{Sender Phone}} | {{Sender Email}}`,
    subjects: ["CU Hyperloop // Digikey", "Partnership Opportunity - CU Hyperloop"],
    variables: ["First Name", "Email", "Sender Name", "Sender Role", "Sender Major", "Sender Phone", "Sender Email"],
    category: "Monetary Outreach",
  },
  {
    name: "L3Harris",
    content: `Subject: CU Hyperloop // L3Harris\nTo: {{Email}}\n\nDear {{First Name}},\n\nMy name is {{Sender Name}}, and I'm with <a href="https://cuhyperloop.org/home">CU Hyperloop</a> at the University of Colorado Boulder. We design and build a fully functional tunnel boring machine each year, integrating mechanical, electrical, and embedded control systems into a single operational platform. Our most recent 13-foot, 2,500-pound TBM just earned us 3rd place globally at The Boring Company's Not-A-Boring Competition.\n\nWe are reaching out to L3Harris because of your industry leadership in resilient communications, ruggedized electronics, and complex system integration for extreme environments. While our project is centered on tunneling, the underlying challenges closely mirror those in aerospace and defense applications - navigating GPS-denied environments, integrating precision guidance systems under high-vibration constraints, and ensuring mission-critical reliability where failure isn't an option. Our team operates at the intersection of civil construction and system integration, taking designs from concept to full-scale testing. This produces engineers who understand not just design, but deployment realities - an area that is often underrepresented in traditional academic training.\n\nSupporting CU Hyperloop is a direct investment in engineers with hands-on experience in underground infrastructure systems and field-driven problem solving.\n\nAs a registered 501(c)(3), all contributions are tax-deductible. I've attached our sponsorship packet with technical milestones and partnership options.\n\nWould you be open to a brief call this week to explore potential alignment with L3Harris?\n\nSincerely,\n\n{{Sender Name}}\nCU Hyperloop | {{Sender Role}}\nCU Boulder | {{Sender Major}}\n{{Sender Phone}} | {{Sender Email}}`,
    subjects: ["CU Hyperloop // L3Harris", "Partnership Opportunity - CU Hyperloop"],
    variables: ["First Name", "Email", "Sender Name", "Sender Role", "Sender Major", "Sender Phone", "Sender Email"],
    category: "Monetary Outreach",
  },
  {
    name: "SRC",
    content: `Subject: CU Hyperloop // Semiconductor Research Corporation\nTo: {{Email}}\n\nHello {{First Name}},\n\nMy name is {{Sender Name}}, and I'm with <a href="https://cuhyperloop.org/home">CU Hyperloop</a> at the University of Colorado Boulder. We design and build a fully functional tunnel boring machine each year, integrating mechanical, electrical, and embedded control systems into a single operational platform. Our most recent 13-foot, 2,500-pound TBM just earned us 3rd place globally at The Boring Company's Not-A-Boring Competition.\n\nWe are reaching out to Semiconductor Research Corporation because your work sits at the intersection of advanced hardware, system reliability, and cross-disciplinary engineering. Our team operates in that same space - developing real-world systems where sensing, control, and power must function together under physical constraints, not just in simulation.\n\nSRC's ongoing support of CU Boulder signals a commitment to building long-term technical capacity within the university ecosystem. CU Hyperloop extends that pipeline by producing engineers who have already worked through integration challenges across hardware and software in full-scale systems.\n\nAs a registered 501(c)(3), any donations are tax-deductible. I've attached our sponsorship packet with current technical milestones and partnership options.\n\nWould you be available for a short call this week to discuss alignment with SRC's research and workforce initiatives?\n\nBest regards,\n\n{{Sender Name}}\nCU Hyperloop | {{Sender Role}}\nCU Boulder | {{Sender Major}}\n{{Sender Phone}} | {{Sender Email}}`,
    subjects: ["CU Hyperloop // Semiconductor Research Corporation", "Partnership Opportunity - CU Hyperloop"],
    variables: ["First Name", "Email", "Sender Name", "Sender Role", "Sender Major", "Sender Phone", "Sender Email"],
    category: "Monetary Outreach",
  },
  {
    name: "Water Research Foundation (WRF)",
    content: `Subject: CU Hyperloop // The Water Research Foundation\nTo: {{Email}}\n\nHello {{First Name}},\n\nMy name is {{Sender Name}}, and I'm with <a href="https://cuhyperloop.org/home">CU Hyperloop</a> at the University of Colorado Boulder. We design and build a fully functional tunnel boring machine each year, integrating mechanical, electrical, and embedded control systems into a single operational platform. Our most recent 13-foot, 2,500-pound TBM just earned us 3rd place globally at The Boring Company's Not-A-Boring Competition.\n\nWe are reaching out to The Water Research Foundation because your work focuses on advancing critical infrastructure systems that must perform reliably in complex, uncertain environments. Our team operates within similar constraints - designing excavation systems that interact with soil, water, and structural loads while maintaining stability and control in real-world conditions.\n\nThe Water Research Foundation's existing support of CU Boulder reflects a broader investment in developing applied engineering capability within the water and infrastructure sector. CU Hyperloop contributes to that ecosystem by training engineers who have already built and tested full-scale systems under physical constraints.\n\nAs a registered 501(c)(3), all contributions are tax-deductible. I've attached our sponsorship packet with current technical milestones and partnership options.\n\nWould you be available for a short call this week to discuss potential alignment?\n\nBest regards,\n\n{{Sender Name}}\nCU Hyperloop | {{Sender Role}}\nCU Boulder | {{Sender Major}}\n{{Sender Phone}} | {{Sender Email}}`,
    subjects: ["CU Hyperloop // Water Research Foundation", "Partnership Opportunity - CU Hyperloop"],
    variables: ["First Name", "Email", "Sender Name", "Sender Role", "Sender Major", "Sender Phone", "Sender Email"],
    category: "Monetary Outreach",
  },
  {
    name: "General - Reliable Systems",
    content: `Subject: CU Hyperloop // {{Company}}\nTo: {{Email}}\n\nHello {{First Name}},\n\nMy name is {{Sender Name}}, and I'm with <a href="https://cuhyperloop.org/home">CU Hyperloop</a> at the University of Colorado Boulder. We design and build a fully functional tunnel boring machine each year, integrating mechanical, electrical, and embedded control systems into a single operational platform. Our most recent 13-foot, 2,500-pound TBM just earned us 3rd place globally at The Boring Company's Not-A-Boring Competition.\n\nWe are reaching out to {{Company}} because your work depends on highly reliable, tightly controlled systems operating at scale. Our team develops those same capabilities - integrating mechanical, electrical, and control systems into a single platform where performance must be validated through full-scale testing, not assumed through simulation alone.\n\nThis is not a general sponsorship request. It is an opportunity to engage directly with a group of engineers already solving multi-domain problems under real operating conditions.\n\nAs a registered 501(c)(3), any donations are tax-deductible. I've attached our sponsorship packet with current technical milestones and partnership options.\n\nWould you be available for a short call this week to discuss potential alignment with {{Company}}?\n\nBest regards,\n\n{{Sender Name}}\nCU Hyperloop | {{Sender Role}}\nCU Boulder | {{Sender Major}}\n{{Sender Phone}} | {{Sender Email}}`,
    subjects: ["CU Hyperloop // {{Company}}", "Partnership Opportunity - CU Hyperloop"],
    variables: ["First Name", "Company", "Email", "Sender Name", "Sender Role", "Sender Major", "Sender Phone", "Sender Email"],
    category: "Monetary Outreach",
  },
  {
    name: "General - Hardware Validation",
    content: `Subject: CU Hyperloop // {{Company}}\nTo: {{Email}}\n\nHello {{First Name}},\n\nMy name is {{Sender Name}}, and I'm with <a href="https://cuhyperloop.org/home">CU Hyperloop</a> at the University of Colorado Boulder. We design and build a fully functional tunnel boring machine each year, integrating mechanical, electrical, and embedded control systems into a single operational platform. Our most recent 13-foot, 2,500-pound TBM just earned us 3rd place globally at The Boring Company's Not-A-Boring Competition.\n\nWe are reaching out to {{Company}} because your work depends on tightly integrated hardware systems where performance, reliability, and validation are critical at scale. Our team develops those same capabilities - integrating mechanical, electrical, and control systems into a single platform where system behavior must be measured, validated, and iterated under real operating conditions rather than assumed through simulation alone.\n\nThis is not a general sponsorship request. It is an opportunity to engage directly with a group of engineers already solving multi-domain problems under real operating conditions.\n\nAs a registered 501(c)(3), any donations are tax-deductible. I've attached our sponsorship packet with current technical milestones and partnership options.\n\nWould you be available for a short call this week to discuss potential alignment with {{Company}}?\n\nBest regards,\n\n{{Sender Name}}\nCU Hyperloop | {{Sender Role}}\nCU Boulder | {{Sender Major}}\n{{Sender Phone}} | {{Sender Email}}`,
    subjects: ["CU Hyperloop // {{Company}}", "Partnership Opportunity - CU Hyperloop"],
    variables: ["First Name", "Company", "Email", "Sender Name", "Sender Role", "Sender Major", "Sender Phone", "Sender Email"],
    category: "Monetary Outreach",
  },
  {
    name: "General - Analog & Embedded",
    content: `Subject: CU Hyperloop // {{Company}}\nTo: {{Email}}\n\nDear {{First Name}},\n\nMy name is {{Sender Name}}, and I'm with <a href="https://cuhyperloop.org/home">CU Hyperloop</a> at the University of Colorado Boulder. We design and build a fully functional tunnel boring machine each year, integrating mechanical, electrical, and embedded control systems into a single operational platform. Our most recent 13-foot, 2,500-pound TBM just earned us 3rd place globally at The Boring Company's Not-A-Boring Competition.\n\nWe are reaching out to {{Company}} because of your leadership in analog and embedded processing technologies that enable precision sensing, real-time control, and reliable operation in demanding environments. While our project is centered on tunneling, the underlying challenges closely mirror those in industrial and mission-critical systems, including operating in GPS-denied environments, integrating high-precision sensor feedback with embedded control loops, and maintaining system reliability.\n\nThis is not a general sponsorship request. It is an opportunity to engage directly with a group of engineers already solving multi-domain problems under real operating conditions.\n\nAs a registered 501(c)(3), any donations are tax-deductible. I've attached our sponsorship packet with current technical milestones and partnership options.\n\nWould you be available for a short call this week to discuss potential alignment with {{Company}}?\n\nSincerely,\n\n{{Sender Name}}\nCU Hyperloop | {{Sender Role}}\nCU Boulder | {{Sender Major}}\n{{Sender Phone}} | {{Sender Email}}`,
    subjects: ["CU Hyperloop // {{Company}}", "Partnership Opportunity - CU Hyperloop"],
    variables: ["First Name", "Company", "Email", "Sender Name", "Sender Role", "Sender Major", "Sender Phone", "Sender Email"],
    category: "Monetary Outreach",
  },
  {
    name: "General Defense (GD)",
    content: `Subject: CU Hyperloop // {{Company}}\nTo: {{Email}}\n\nHello {{First Name}},\n\nMy name is {{Sender Name}}, and I'm with <a href="https://cuhyperloop.org/home">CU Hyperloop</a>, a student engineering team at the University of Colorado Boulder. Each year, we design and build a fully functional tunnel boring machine. Our 13-foot, 2,500-pound TBM earned 2nd place globally at The Boring Company's Not-A-Boring Competition.\n\nWe're reaching out to {{Company}} because your work requires reliable performance under constrained, uncertain conditions. Our team develops those capabilities directly - building and testing hardware that must operate with limited visibility, tightly coupled power and control, and costly failure modes.\n\nMost undergraduate work stops at analysis or isolated components. Our team takes a full machine from concept through fabrication to field operation, producing engineers with hands-on experience diagnosing and resolving real-world issues.\n\nSupporting CU Hyperloop is a targeted way to engage with engineers who have already operated complex hardware under real constraints.\n\nAs a registered 501(c)(3), all contributions are tax-deductible. I've attached our sponsorship packet with current technical milestones and partnership options.\n\nWould you be available for a short call in the next few weeks to explore alignment?\n\nBest regards,\n\n{{Sender Name}}\nCU Hyperloop | {{Sender Role}}\nCU Boulder | {{Sender Major}}\n{{Sender Phone}} | {{Sender Email}}`,
    subjects: ["CU Hyperloop // {{Company}}", "Partnership Opportunity - CU Hyperloop"],
    variables: ["First Name", "Company", "Email", "Sender Name", "Sender Role", "Sender Major", "Sender Phone", "Sender Email"],
    category: "Monetary Outreach",
  },
  {
    name: "General Oil & Engineering (GO)",
    content: `Subject: CU Hyperloop // {{Company}}\nTo: {{Email}}\n\nHello {{First Name}},\n\nMy name is {{Sender Name}}, and I'm with <a href="https://cuhyperloop.org/home">CU Hyperloop</a>, a student engineering team at the University of Colorado Boulder. Each year, we design and build a fully functional tunnel boring machine, integrating mechanical, electrical, and software systems into a single operational platform. Our 13-foot, 2,500-pound TBM recently earned 2nd place globally at The Boring Company's Not-A-Boring Competition.\n\nWe are reaching out to {{Company}} because your work demands engineers who can operate across disciplines and deliver reliable systems in high-stakes environments. Our team develops those exact capabilities - designing for load uncertainty, managing power and control systems, and validating performance through full-scale testing rather than simulation alone.\n\nThis is not a traditional sponsorship request. It is a targeted investment in a pipeline of engineers who are already working through the same types of constraints your teams face. Supporting CU Hyperloop provides early access to engineers with demonstrated experience taking complex hardware from concept to operation under pressure.\n\nAs a registered 501(c)(3), all contributions are tax-deductible. I've attached our sponsorship packet with current technical milestones and partnership options.\n\nWould you be available for a short call this week to discuss how a partnership with {{Company}} could align with your recruiting and engineering initiatives?\n\nBest regards,\n\n{{Sender Name}}\nCU Hyperloop | {{Sender Role}}\nCU Boulder | {{Sender Major}}\n{{Sender Phone}} | {{Sender Email}}`,
    subjects: ["CU Hyperloop // {{Company}}", "Partnership Opportunity - CU Hyperloop"],
    variables: ["First Name", "Company", "Email", "Sender Name", "Sender Role", "Sender Major", "Sender Phone", "Sender Email"],
    category: "Monetary Outreach",
  },
  {
    name: "Micron",
    content: `Subject: CU Hyperloop // Micron Technology\nTo: {{Email}}\n\nHello {{First Name}},\n\nMy name is {{Sender Name}}, and I'm with <a href="https://cuhyperloop.org/home">CU Hyperloop</a> at the University of Colorado Boulder. We design and build a fully functional tunnel boring machine each year, integrating mechanical, electrical, and embedded control systems into a single operational platform. Our most recent 13-foot, 2,500-pound TBM just earned us 3rd place globally at The Boring Company's Not-A-Boring Competition.\n\nWe are reaching out to {{Company}} because your work depends on highly reliable, tightly controlled systems operating at scale. Our team develops those same capabilities - integrating mechanical, electrical, and control systems into a single platform where performance must be validated through full-scale testing, not assumed through simulation alone.\n\nThis is not a general sponsorship request. It is an opportunity to engage directly with a group of engineers already solving multi-domain problems under real operating conditions.\n\nAs a registered 501(c)(3), any donations are tax-deductible. I've attached our sponsorship packet with current technical milestones and partnership options.\n\nWould you be available for a short call this week to discuss potential alignment with {{Company}}?\n\nBest regards,\n\n{{Sender Name}}\nCU Hyperloop | {{Sender Role}}\nCU Boulder | {{Sender Major}}\n{{Sender Phone}} | {{Sender Email}}`,
    subjects: ["CU Hyperloop // {{Company}}", "Partnership Opportunity - CU Hyperloop"],
    variables: ["First Name", "Company", "Email", "Sender Name", "Sender Role", "Sender Major", "Sender Phone", "Sender Email"],
    category: "Monetary Outreach",
  },
  {
    name: "Intel",
    content: `Subject: CU Hyperloop // Intel\nTo: {{Email}}\n\nHello {{First Name}},\n\nMy name is {{Sender Name}}, and I'm with <a href="https://cuhyperloop.org/home">CU Hyperloop</a> at the University of Colorado Boulder. We design and build a fully functional tunnel boring machine each year, integrating mechanical, electrical, and embedded control systems into a single operational platform. Our most recent 13-foot, 2,500-pound TBM just earned us 3rd place globally at The Boring Company's Not-A-Boring Competition.\n\nWe are reaching out to {{Company}} because your work depends on tightly integrated hardware systems where performance, reliability, and validation are critical at scale. Our team develops those same capabilities - integrating mechanical, electrical, and control systems into a single platform where system behavior must be measured, validated, and iterated under real operating conditions rather than assumed through simulation alone.\n\nThis is not a general sponsorship request. It is an opportunity to engage directly with a group of engineers already solving multi-domain problems under real operating conditions.\n\nAs a registered 501(c)(3), any donations are tax-deductible. I've attached our sponsorship packet with current technical milestones and partnership options.\n\nWould you be available for a short call this week to discuss potential alignment with {{Company}}?\n\nBest regards,\n\n{{Sender Name}}\nCU Hyperloop | {{Sender Role}}\nCU Boulder | {{Sender Major}}\n{{Sender Phone}} | {{Sender Email}}`,
    subjects: ["CU Hyperloop // {{Company}}", "Partnership Opportunity - CU Hyperloop"],
    variables: ["First Name", "Company", "Email", "Sender Name", "Sender Role", "Sender Major", "Sender Phone", "Sender Email"],
    category: "Monetary Outreach",
  },
  {
    name: "Texas Instruments",
    content: `Subject: CU Hyperloop // Texas Instruments\nTo: {{Email}}\n\nDear {{First Name}},\n\nMy name is {{Sender Name}}, and I'm with <a href="https://cuhyperloop.org/home">CU Hyperloop</a> at the University of Colorado Boulder. We design and build a fully functional tunnel boring machine each year, integrating mechanical, electrical, and embedded control systems into a single operational platform. Our most recent 13-foot, 2,500-pound TBM just earned us 3rd place globally at The Boring Company's Not-A-Boring Competition.\n\nWe are reaching out to {{Company}} because of your leadership in analog and embedded processing technologies that enable precision sensing, real-time control, and reliable operation in demanding environments. While our project is centered on tunneling, the underlying challenges closely mirror those in industrial and mission-critical systems, including operating in GPS-denied environments, integrating high-precision sensor feedback with embedded control loops, and maintaining system reliability.\n\nThis is not a general sponsorship request. It is an opportunity to engage directly with a group of engineers already solving multi-domain problems under real operating conditions.\n\nAs a registered 501(c)(3), any donations are tax-deductible. I've attached our sponsorship packet with current technical milestones and partnership options.\n\nWould you be available for a short call this week to discuss potential alignment with {{Company}}?\n\nSincerely,\n\n{{Sender Name}}\nCU Hyperloop | {{Sender Role}}\nCU Boulder | {{Sender Major}}\n{{Sender Phone}} | {{Sender Email}}`,
    subjects: ["CU Hyperloop // {{Company}}", "Partnership Opportunity - CU Hyperloop"],
    variables: ["First Name", "Company", "Email", "Sender Name", "Sender Role", "Sender Major", "Sender Phone", "Sender Email"],
    category: "Monetary Outreach",
  },
];

export async function seedTemplates() {
  const existingTemplates = await projectStore.listTemplates();
  const existingNames = new Set(existingTemplates.map((t) => t.name));

  for (const t of SEED_TEMPLATES) {
    if (!existingNames.has(t.name)) {
      await projectStore.saveTemplate({
        id: crypto.randomUUID(),
        name: t.name,
        subjects: t.subjects,
        content: t.content,
        variables: t.variables,
        category: t.category,
        versions: [],
      });
      console.log(`Seeded template: ${t.name}`);
    }
  }
}
