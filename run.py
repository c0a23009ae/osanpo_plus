# from app import create_app

# app = create_app()

# if __name__ == "__main__":
#     app.run(debug=True)

from flask import Flask
from main import main_bp

app = Flask(__name__)
app.register_blueprint(main_bp)

if __name__ == "__main__":
    # デバッグモード、ポート5000で起動
    app.run(debug=True, port=5000)
