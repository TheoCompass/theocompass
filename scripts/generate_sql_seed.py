import pandas as pd
import math
import re
import os

# ==========================================
# CONFIGURATION - Dynamic File Paths
# ==========================================
# Get the absolute path of the directory this script is currently in (the /scripts folder)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Define the paths relative to the script's location
ROOT_DIR = os.path.join(SCRIPT_DIR, '..')
DATA_DIR = os.path.join(ROOT_DIR, 'data')
PRECOMP_DIR = os.path.join(ROOT_DIR, 'precomputed')

# Build the absolute paths for every required file
FILES = {
    'denominations': os.path.join(DATA_DIR, 'TheoCompass (v2.0) - Pre-demo_Denominations.csv'),
    'questions': os.path.join(DATA_DIR, 'TheoCompass (v2.0) - QUESTION_MASTER.csv'),
    'answers': os.path.join(DATA_DIR, 'TheoCompass (v2.0) - Unified Answer Scoring Matrix.csv'),
    'doctrines': os.path.join(DATA_DIR, 'TheoCompass (v2.0) - Denominations & Doctrines_EXPORT.csv'),
    'hidden_dims': os.path.join(DATA_DIR, 'TheoCompass (v2.0) - Hidden Dimensions.csv'), # Fixed filename spacing
    'sequence': os.path.join(DATA_DIR, 'TheoCompass (v2.0) - QUIZ_SEQUENCE.csv'),
    
    # This one comes from the Node.js output!
    'mode_summary': os.path.join(PRECOMP_DIR, 'denomination_mode_summary.csv')
}

# Ensure the final seed file drops into the root folder
OUTPUT_FILE = os.path.join(ROOT_DIR, 'seed.sql')

def clean_str(val):
    if pd.isna(val):
        return 'NULL'
    # Escape single quotes for SQL
    cleaned = str(val).strip().replace("'", "''")
    return f"'{cleaned}'"

def clean_num(val):
    if pd.isna(val) or val == 'N/A' or str(val).strip() == '':
        return 'NULL'
    try:
        return str(float(val))
    except ValueError:
        return 'NULL'

def main():
    print("🚀 Starting SQL Seed Generation...")
    sql_statements = []

    # 1. Denominations
    print("Processing Denominations...")
    df_denoms = pd.read_csv(FILES['doctrines'])
    sql_statements.append("-- ==========================================")
    sql_statements.append("-- TABLE: denominations")
    sql_statements.append("-- ==========================================")
    for _, row in df_denoms.iterrows():
        d_id = clean_str(row['Denomination_ID'])
        name = clean_str(row['Denomination_Name'])
        family = clean_str(row.get('Denomination_Family'))
        year = clean_str(row.get('Founded_Year'))
        region = clean_str(row.get('Region_Origin'))
        desc = clean_str(row.get('Description'))
        
        sql = f"INSERT OR REPLACE INTO denominations (id, name, family, founded_year, region_origin, description) VALUES ({d_id}, {name}, {family}, {year}, {region}, {desc});"
        sql_statements.append(sql)

    # 2. Questions
    print("Processing Questions...")
    df_q = pd.read_csv(FILES['questions'])
    sql_statements.append("\n-- ==========================================")
    sql_statements.append("-- TABLE: questions")
    sql_statements.append("-- ==========================================")
    for _, row in df_q.iterrows():
        q_id = clean_str(row['Question_ID'])
        cat = clean_str(row['Category_Code'])
        score = clean_num(row['Priority_Score'])
        text = clean_str(row['Full_Question'])
        
        sql = f"INSERT OR REPLACE INTO questions (id, category_code, priority_score, full_text) VALUES ({q_id}, {cat}, {score}, {text});"
        sql_statements.append(sql)

    # 3. Answer Options
    print("Processing Answer Options...")
    df_ans = pd.read_csv(FILES['answers'])
    sql_statements.append("\n-- ==========================================")
    sql_statements.append("-- TABLE: answer_options")
    sql_statements.append("-- ==========================================")
    for _, row in df_ans.iterrows():
        a_id = clean_str(row['Answer_ID'])
        q_id = clean_str(row['Question_ID'])
        ans_text = clean_str(row['Answer'])
        label = clean_str(row['Theological_Label'])
        desc = clean_str(row['Full_Description'])
        
        sql = f"INSERT OR REPLACE INTO answer_options (id, question_id, answer_text, theological_label, description) VALUES ({a_id}, {q_id}, {ans_text}, {label}, {desc});"
        sql_statements.append(sql)

    # 4. Denomination Answers & Selected Options (Splits)
    print("Processing Denomination Answers...")
    sql_statements.append("\n-- ==========================================")
    sql_statements.append("-- TABLES: denomination_answers & selected_options")
    sql_statements.append("-- ==========================================")
    
    # We only process columns that end with _Answer, _Certainty, _Tolerance
    q_ids = set()
    for col in df_denoms.columns:
        if col.endswith('_Answer'):
            q_ids.add(col.replace('_Answer', ''))

    for _, row in df_denoms.iterrows():
        d_id = clean_str(row['Denomination_ID'])
        
        for q_id in q_ids:
            ans_col = f"{q_id}_Answer"
            cert_col = f"{q_id}_Certainty"
            tol_col = f"{q_id}_Tolerance"
            
            if ans_col not in row or pd.isna(row[ans_col]):
                continue
                
            raw_answer = str(row[ans_col]).strip()
            if not raw_answer or raw_answer == 'nan':
                continue
                
            certainty = clean_str(row.get(cert_col))
            tolerance = clean_str(row.get(tol_col))
            sql_q_id = clean_str(q_id)
            
            # Insert main answer record
            sql_ans = f"INSERT OR REPLACE INTO denomination_answers (denomination_id, question_id, certainty, tolerance) VALUES ({d_id}, {sql_q_id}, {certainty}, {tolerance});"
            sql_statements.append(sql_ans)
            
            # Handle splits (separated by |)
            splits = [s.strip() for s in raw_answer.split('|')]
            for split_ans in splits:
                clean_split = clean_str(split_ans)
                sql_split = f"INSERT OR REPLACE INTO denomination_selected_options (denomination_id, question_id, answer_text) VALUES ({d_id}, {sql_q_id}, {clean_split});"
                sql_statements.append(sql_split)

    # 5. Precomputed Compass Coordinates (Materialized View)
    print("Processing Scattermap Coordinates...")
    df_mode = pd.read_csv(FILES['mode_summary'])
    sql_statements.append("\n-- ==========================================")
    sql_statements.append("-- TABLE: denomination_compass_coordinates")
    sql_statements.append("-- ==========================================")
    
    for _, row in df_mode.iterrows():
        d_id = clean_str(row['Denomination_ID'])
        mode = clean_str(row['Mode'])
        tol_score = clean_num(row['ToleranceScore'])
        
        # Dimensions
        tcl = clean_num(row['Theol_Cons_Lib_avg'])
        scl = clean_num(row['Social_Cons_Lib_avg'])
        cpm = clean_num(row['Counter_Pro_Modern_avg'])
        sn = clean_num(row['Super_Nat_avg'])
        cse = clean_num(row['Cult_Sep_Eng_avg'])
        ce = clean_num(row['Cleric_Egal_avg'])
        dha = clean_num(row['Div_Hum_Agency_avg'])
        ci = clean_num(row['Commun_Indiv_avg'])
        ls = clean_num(row['Liturg_Spont_avg'])
        sf = clean_num(row['Sacram_Funct_avg'])
        lc = clean_num(row['Literal_Crit_avg'])
        ie = clean_num(row['Intellect_Exper_avg'])
        
        sql = f"INSERT OR REPLACE INTO denomination_compass_coordinates (denomination_id, mode, tolerance_score, theol_cons_lib_avg, social_cons_lib_avg, counter_pro_modern_avg, super_nat_avg, cult_sep_eng_avg, cleric_egal_avg, div_hum_agency_avg, commun_indiv_avg, liturg_spont_avg, sacram_funct_avg, literal_crit_avg, intellect_exper_avg) VALUES ({d_id}, {mode}, {tol_score}, {tcl}, {scl}, {cpm}, {sn}, {cse}, {ce}, {dha}, {ci}, {ls}, {sf}, {lc}, {ie});"
        sql_statements.append(sql)

    # Write output
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write('\n'.join(sql_statements))
        
    print(f"\n✅ Success! Wrote {len(sql_statements)} SQL statements to {OUTPUT_FILE}")

if __name__ == '__main__':
    main()
