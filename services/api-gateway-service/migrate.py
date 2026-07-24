import os
import sys
from sqlalchemy import create_engine, text

def run_migration():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL is not set. Skipping migration.")
        sys.exit(1)
        
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
        
    print(f"Connecting to database to check and run migrations...")
    try:
        engine = create_engine(database_url, pool_pre_ping=True)
        with engine.connect() as conn:
            # Check if nexus_chat_history has column 'execution'
            check_query = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='nexus_chat_history' AND column_name='execution';
            """)
            result = conn.execute(check_query).fetchone()
            
            if result:
                print("Column 'execution' already exists in 'nexus_chat_history'. No migration needed.")
            else:
                print("Column 'execution' does not exist in 'nexus_chat_history'. Adding it...")
                conn.execute(text("ALTER TABLE nexus_chat_history ADD COLUMN execution JSON;"))
                conn.commit()
                print("Successfully added column 'execution' to 'nexus_chat_history'.")
                
    except Exception as e:
        print(f"Migration failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run_migration()
