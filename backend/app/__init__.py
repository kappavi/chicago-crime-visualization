from flask import Flask
from flask_cors import CORS

def create_app():
    app = Flask(__name__, 
                static_folder='../../static',
                template_folder='../../templates')
    CORS(app)
    
    # Configure app
    app.config['JSON_SORT_KEYS'] = False
    
    # Register blueprints
    from .routes import main_bp
    app.register_blueprint(main_bp)
    
    return app 