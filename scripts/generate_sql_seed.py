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
    'questions': os.path.join(DATA_DIR, 'TheoCompass (v2.0) - QUESTION_MASTER.csv'),
    'answers': os.path.join(DATA_DIR, 'TheoCompass (v2.0) - Unified Answer Scoring Matrix.csv'),
    'doctrines': os.path.join(DATA_DIR, 'TheoCompass (v2.0) - Denominations & Doctrines_EXPORT.csv'),
    'hidden_dims': os.path.join(DATA_DIR, 'TheoCompass (v2.0) - Hidden Dimensions.csv'), # Fixed filename spacing
    'sequence': os.path.join(DATA_DIR, 'TheoCompass (v2.0) - QUIZ_SEQUENCE.csv'),
    'families': os.path.join(DATA_DIR, 'TheoCompass (v2.0) - FAMILIES.csv'),
    
    # This one comes from the Node.js output!
    'mode_summary': os.path.join(PRECOMP_DIR, 'denomination_mode_summary.csv')
}

# Drop the final seed file directly into the API folder for Wrangler
OUTPUT_FILE = os.path.join(ROOT_DIR, 'theocompass-api', 'seed.sql')

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

    # 0. Create Database Schemas
    print("Generating Schema Creation Statements...")
    sql_statements.append("-- ==========================================")
    sql_statements.append("-- INITIALIZE SCHEMAS")
    sql_statements.append("-- ==========================================")
    
    # We added the 6 sequence columns to the questions table here!
    schema_sql = """
    -- 1. Wipe existing tables clean to prevent schema conflicts
    DROP TABLE IF EXISTS denominations;
    DROP TABLE IF EXISTS questions;
    DROP TABLE IF EXISTS answer_options;
    DROP TABLE IF EXISTS denomination_answers;
    DROP TABLE IF EXISTS denomination_selected_options;
    DROP TABLE IF EXISTS denomination_compass_coordinates;
    DROP TABLE IF EXISTS hidden_dimensions;
    DROP TABLE IF EXISTS answer_scoring;

    -- 2. Recreate tables with correct schemas
    CREATE TABLE denominations (id TEXT PRIMARY KEY, name TEXT, family TEXT, founded_year TEXT, region_origin TEXT, description TEXT);
    
    CREATE TABLE questions (
        id TEXT PRIMARY KEY, 
        category_code TEXT, 
        priority_score REAL, 
        full_text TEXT,
        include_quick INTEGER,
        display_order_quick REAL,
        include_standard INTEGER,
        display_order_standard REAL,
        include_deep INTEGER,
        display_order_deep REAL
    );
    
    CREATE TABLE answer_options (id TEXT PRIMARY KEY, question_id TEXT, answer_text TEXT, theological_label TEXT, description TEXT);
    
    CREATE TABLE denomination_answers (denomination_id TEXT, question_id TEXT, certainty REAL, tolerance REAL, PRIMARY KEY (denomination_id, question_id));
    
    CREATE TABLE denomination_selected_options (denomination_id TEXT, question_id TEXT, answer_text TEXT);
    
    CREATE TABLE denomination_compass_coordinates (denomination_id TEXT, mode TEXT, tolerance_score REAL, theol_cons_lib_avg REAL, social_cons_lib_avg REAL, counter_pro_modern_avg REAL, super_nat_avg REAL, cult_sep_eng_avg REAL, cleric_egal_avg REAL, div_hum_agency_avg REAL, commun_indiv_avg REAL, liturg_spont_avg REAL, sacram_funct_avg REAL, literal_crit_avg REAL, intellect_exper_avg REAL, PRIMARY KEY (denomination_id, mode));
    
    CREATE TABLE hidden_dimensions (question_id TEXT PRIMARY KEY, theol_cons_lib REAL, social_cons_lib REAL, counter_pro_modern REAL, super_nat REAL, cult_sep_eng REAL, cleric_egal REAL, div_hum_agency REAL, commun_indiv REAL, liturg_spont REAL, sacram_funct REAL, literal_crit REAL, intellect_exper REAL);
    
    CREATE TABLE answer_scoring (answer_id TEXT PRIMARY KEY, theol_cons_lib REAL, social_cons_lib REAL, counter_pro_modern REAL, super_nat REAL, cult_sep_eng REAL, cleric_egal REAL, div_hum_agency REAL, commun_indiv REAL, liturg_spont REAL, sacram_funct REAL, literal_crit REAL, intellect_exper REAL);
    """

    
    sql_statements.append(schema_sql)

    # 1. Denominations & Families
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

    print("Processing Families...")
    # Add to file paths at the top: 'families': os.path.join(DATA_DIR, 'TheoCompass v2.0 - FAMILIES.csv')
    df_families = pd.read_csv(FILES['families'])
    
    sql_statements.append("-- TABLE denomination_families")
    sql_statements.append("DROP TABLE IF EXISTS denomination_families;")
    sql_statements.append("""
    CREATE TABLE denomination_families (
        name TEXT PRIMARY KEY,
        founded_century TEXT,
        region_origin TEXT,
        est_members TEXT,
        description TEXT
    );
    """)
    
    for _, row in df_families.iterrows():
        name = clean_str(row['Family_Name'])
        century = clean_str(row.get('Founded_Century'))
        region = clean_str(row.get('Region_Origin'))
        members = clean_str(row.get('Est_Members_Global'))
        desc = clean_str(row.get('Description'))
        
        sql = f"INSERT OR REPLACE INTO denomination_families (name, founded_century, region_origin, est_members, description) VALUES ({name}, {century}, {region}, {members}, {desc});"
        sql_statements.append(sql)

    # 2. Questions (Merged with Sequence)
    print("Processing Questions and Quiz Sequence...")
    df_q = pd.read_csv(FILES['questions'])
    df_seq = pd.read_csv(FILES['sequence'])
    
    # Merge on Question_ID
    df_merged_q = pd.merge(df_q, df_seq, on='Question_ID', how='left')
    
    sql_statements.append("\n-- ==========================================")
    sql_statements.append("-- TABLE: questions (with sequence)")
    sql_statements.append("-- ==========================================")
    for _, row in df_merged_q.iterrows():
        q_id = clean_str(row['Question_ID'])
        
        # Grab from the master side (_x)
        cat = clean_str(row['Category_Code_x'])
        score = clean_num(row['Priority_Score_x'])
        
        text_col = 'Full_Question_x' if 'Full_Question_x' in row else 'Full_Question'
        text = clean_str(row[text_col])
        
        # Sequence data (from QUIZ_SEQUENCE) - FIX IS HERE
        # We strip strings and check for 'TRUE'. If it matches, we output the integer 1. Otherwise 0.
        
        val_quick = str(row.get('Include_Quick')).strip().upper()
        inc_quick = 1 if val_quick == 'TRUE' else 0
        ord_quick = clean_num(row.get('Display_Order_Quick'))
        
        val_std = str(row.get('Include_Standard')).strip().upper()
        inc_std = 1 if val_std == 'TRUE' else 0
        ord_std = clean_num(row.get('Display_Order_Standard'))
        
        val_deep = str(row.get('Include_Deep')).strip().upper()
        inc_deep = 1 if val_deep == 'TRUE' else 0
        ord_deep = clean_num(row.get('Display_Order_Deep'))
        
        sql = f"""INSERT OR REPLACE INTO questions 
        (id, category_code, priority_score, full_text, include_quick, display_order_quick, include_standard, display_order_standard, include_deep, display_order_deep) 
        VALUES ({q_id}, {cat}, {score}, {text}, {inc_quick}, {ord_quick}, {inc_std}, {ord_std}, {inc_deep}, {ord_deep});"""
        
        sql_statements.append(sql.replace('\n', ' '))



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


    # 6. Hidden Dimensions
    print("Processing Hidden Dimensions...")
    df_dims = pd.read_csv(FILES['hidden_dims'])
    sql_statements.append("\n-- ==========================================")
    sql_statements.append("-- TABLE: hidden_dimensions")
    sql_statements.append("-- ==========================================")
    
    # Map verbose CSV headers to standard database column names
    dim_cols = {
        'Theol_Cons_Lib': 'theol_cons_lib', 'Social_Cons_Lib': 'social_cons_lib',
        'Counter_Pro_Modernity': 'counter_pro_modern', 'Supernatural_Natural': 'super_nat',
        'Cultural_Sep_Eng': 'cult_sep_eng', 'Clerical_Egal': 'cleric_egal',
        'Divine_Human_Agency': 'div_hum_agency', 'Communal_Individual': 'commun_indiv',
        'Liturgical_Spontaneous': 'liturg_spont', 'Sacramental_Functional': 'sacram_funct',
        'Literal_Critical': 'literal_crit', 'Intellectual_Experiential': 'intellect_exper'
    }
    
    for _, row in df_dims.iterrows():
        q_id = clean_str(row['Question_ID'])
        cols = ['question_id']
        vals = [q_id]
        
        for csv_col, db_col in dim_cols.items():
            if csv_col in row and not pd.isna(row[csv_col]):
                cols.append(db_col)
                vals.append(clean_num(row[csv_col]))
                
        sql = f"INSERT OR REPLACE INTO hidden_dimensions ({', '.join(cols)}) VALUES ({', '.join(vals)});"
        sql_statements.append(sql)


    # 7. Answer Scoring Matrix (Dimensions)
    print("Processing Answer Scoring Matrix...")
    df_scores = pd.read_csv(FILES['answers'])
    sql_statements.append("\n-- ==========================================")
    sql_statements.append("-- TABLE: answer_scoring")
    sql_statements.append("-- ==========================================")
    
    score_cols = {
        'Theol_Cons_Lib': 'theol_cons_lib', 'Social_Cons_Lib': 'social_cons_lib',
        'Counter_Pro_Modern': 'counter_pro_modern', 'Super_Nat': 'super_nat',
        'Cult_Sep_Eng': 'cult_sep_eng', 'Cleric_Egal': 'cleric_egal',
        'Div_Hum_Agency': 'div_hum_agency', 'Commun_Indiv': 'commun_indiv',
        'Liturg_Spont': 'liturg_spont', 'Sacram_Funct': 'sacram_funct',
        'Literal_Crit': 'literal_crit', 'Intellect_Exper': 'intellect_exper'
    }
    
    for _, row in df_scores.iterrows():
        a_id = clean_str(row['Answer_ID'])
        cols = ['answer_id']
        vals = [a_id]
        
        for csv_col, db_col in score_cols.items():
            if csv_col in row and not pd.isna(row[csv_col]) and str(row[csv_col]).strip() != 'N/A':
                cols.append(db_col)
                vals.append(clean_num(row[csv_col]))
                
        sql = f"INSERT OR REPLACE INTO answer_scoring ({', '.join(cols)}) VALUES ({', '.join(vals)});"
        sql_statements.append(sql)


    # Write output
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write('\n'.join(sql_statements))
        
    print(f"\n✅ Success! Wrote {len(sql_statements)} SQL statements to {OUTPUT_FILE}")

if __name__ == '__main__':
    main()
