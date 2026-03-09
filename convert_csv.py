import csv
import sys

def process():
    with open('raw_data.tsv', 'r') as f:
        lines = f.readlines()

    out_rows = []
    out_rows.append(["Name", "Role", "Company", "Website", "Email", "Notes", "Member", "Template"])

    for line in lines:
        line = line.strip('\n')
        if not line: continue
        cols = line.split('\t')
        
        # We need handles for the 10-11 columns
        # Index 0: Name, 1: Role, 2: Company, 3: Website, 4: Email, 5: empty, 6: Notes (optional), 7: empty, 8: empty, 9: Member, 10: Template
        
        # Let's clean up empty columns between Email and Member just by taking all strings backwards
        # First 5 are fixed
        name = cols[0] if len(cols) > 0 else ""
        role = cols[1] if len(cols) > 1 else ""
        company = cols[2] if len(cols) > 2 else ""
        website = cols[3] if len(cols) > 3 else ""
        email = cols[4] if len(cols) > 4 else ""
        
        rest = cols[5:]
        # Remove empty columns
        non_empty = [c for c in rest if c.strip() != ""]
        
        notes = ""
        member = ""
        template = ""
        
        if len(non_empty) == 3:
            notes, member, template = non_empty
        elif len(non_empty) == 2:
            if "template" in non_empty[1].lower() or "templates" in non_empty[1].lower():
                member, template = non_empty
            else:
                notes, member = non_empty
        elif len(non_empty) == 1:
            member = non_empty[0]

        # Force member to be Matis since it is the only active profile
        member = "Matis"
            
        # Set template strictly to company name, or fallback for bottom rows
        template = company.strip()
        if not template or template.lower().strip() in ["general template", ""]:
            template = "General Tunneling Template"

        out_rows.append([name, role, company, website, email, notes, member, template])

    with open('contacts.csv', 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerows(out_rows)
        
    print(f"Successfully processed {len(out_rows)-1} rows into contacts.csv")

if __name__ == '__main__':
    process()
