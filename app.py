from flask import Flask
from app.main import main_bp

app = Flask(
    __name__,
    static_folder="app/static",     
    template_folder="app/templates"  
)

app.register_blueprint(main_bp)

if __name__ == "__main__":
    app.run(debug=True, port=5000)
