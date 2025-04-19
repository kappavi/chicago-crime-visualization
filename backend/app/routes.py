from flask import Blueprint, jsonify, render_template, request
import pandas as pd
import json
import numpy as np
from datetime import datetime
from collections import Counter
from .analytics import perform_cluster_analysis, predict_arrest_probability, analyze_crime_trends
import os
import csv

# Custom JSON encoder to handle special values like NaN, Infinity
class CustomJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, float):
            if np.isnan(obj):
                return None
            if np.isinf(obj):
                if obj > 0:
                    return 40.0  # Use a more reasonable maximum percentage
                else:
                    return -40.0  # Use a more reasonable minimum percentage
        return super(CustomJSONEncoder, self).default(obj)

main_bp = Blueprint('main', __name__)

# Load data function
def load_data():
    try:
        file_path = 'data/raw_data.csv'
        
        # Check if file exists
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Data file not found: {file_path}")
        
        # Load data with optimized settings
        df = pd.read_csv(file_path, 
                         low_memory=False,
                         parse_dates=['Date'])
        
        # Ensure required columns exist
        required_columns = ['Date', 'Primary Type', 'Latitude', 'Longitude', 'Year', 'Arrest', 'Domestic']
        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
            raise ValueError(f"Missing required columns in data file: {', '.join(missing_columns)}")
        
        # Fill NA values for coordinates
        df['Latitude'].fillna(df['Latitude'].mean(), inplace=True)
        df['Longitude'].fillna(df['Longitude'].mean(), inplace=True)
        
        return df
    except Exception as e:
        print(f"Error loading data: {str(e)}")
        raise

# Cache data to avoid reloading
crime_data = None

@main_bp.route('/')
def index():
    return render_template('index.html')

@main_bp.route('/api/crime-data')
def get_crime_data():
    try:
        global crime_data
        if crime_data is None:
            try:
                crime_data = load_data()
            except Exception as e:
                return jsonify({"error": f"Failed to load crime data: {str(e)}"}), 500
        
        # Query parameters for filtering
        year = request.args.get('year')
        crime_type = request.args.get('type')
        district = request.args.get('district')
        
        # Apply filters
        filtered_data = crime_data.copy()
        
        # Print debugging info
        print(f"Filtering data - Before filters: {len(filtered_data)} records")
        print(f"Filters: year={year}, type={crime_type}, district={district}")
        
        try:
            if year:
                filtered_data = filtered_data[filtered_data['Year'] == int(year)]
                print(f"After year filter: {len(filtered_data)} records")
            
            if crime_type:
                # Ensure primary type exists and handle case sensitivity
                if 'Primary Type' in filtered_data.columns:
                    # Case-insensitive filtering to be more flexible
                    filtered_data = filtered_data[
                        filtered_data['Primary Type'].str.upper() == crime_type.upper()
                    ]
                    print(f"After crime type filter: {len(filtered_data)} records")
                else:
                    print("Warning: 'Primary Type' column not found in data")
            
            if district:
                filtered_data = filtered_data[filtered_data['District'] == int(district)]
                print(f"After district filter: {len(filtered_data)} records")
            
        except Exception as filter_error:
            print(f"Error during filtering: {filter_error}")
            return jsonify({"error": f"Error applying filters: {str(filter_error)}"}), 400
        
        # Check if we have any data after filtering
        if len(filtered_data) == 0:
            return jsonify([])
        
        # Convert to dictionary for response (limit to 5000 records for performance)
        try:
            # Handle NaN values before JSON serialization
            filtered_data = filtered_data.fillna({
                col: "Unknown" if filtered_data[col].dtype == object else 0 
                for col in filtered_data.columns
            })
            
            # Replace NaN, inf, and -inf with None (which gets serialized to null in JSON)
            result = filtered_data.head(5000).replace([np.inf, -np.inf], None).to_dict('records')
            
            # Additional check to remove any NaN values that might have been missed
            for record in result:
                for key, value in list(record.items()):
                    if isinstance(value, float) and (np.isnan(value) or np.isinf(value)):
                        record[key] = None
            
            return jsonify(result)
        except Exception as convert_error:
            print(f"Error converting filtered data to records: {convert_error}")
            return jsonify({"error": f"Error preparing response: {str(convert_error)}"}), 500
            
    except Exception as e:
        print(f"Unexpected error in get_crime_data: {e}")
        return jsonify({"error": f"An error occurred processing crime data: {str(e)}"}), 500

@main_bp.route('/api/crime-summary')
def get_crime_summary():
    global crime_data
    if crime_data is None:
        crime_data = load_data()
    
    # Create summary statistics
    summary = {
        'total_crimes': len(crime_data),
        'crimes_by_type': crime_data['Primary Type'].value_counts().to_dict(),
        'crimes_by_year': crime_data['Year'].value_counts().sort_index().to_dict(),
        'arrest_rate': crime_data['Arrest'].mean() * 100,
        'domestic_rate': crime_data['Domestic'].mean() * 100,
    }
    
    return jsonify(summary)

@main_bp.route('/api/heatmap-data')
def get_heatmap_data():
    global crime_data
    if crime_data is None:
        crime_data = load_data()
    
    # Query parameters
    year = request.args.get('year')
    crime_type = request.args.get('type')
    district = request.args.get('district')
    
    # Apply filters
    filtered_data = crime_data.copy()
    if year:
        filtered_data = filtered_data[filtered_data['Year'] == int(year)]
    if crime_type:
        filtered_data = filtered_data[filtered_data['Primary Type'] == crime_type]
    if district:
        filtered_data = filtered_data[filtered_data['District'] == int(district)]
    
    # Limit to max 5000 points for performance
    if len(filtered_data) > 5000:
        filtered_data = filtered_data.sample(5000, random_state=42)
    elif len(filtered_data) == 0:
        # If no data matches the filters, return a small dataset showing Chicago center
        return jsonify([[41.8781, -87.6298]])
    
    # Extract coordinates for heatmap, ensure they are valid
    coords = filtered_data[['Latitude', 'Longitude']].dropna()
    
    # Filter out any invalid coordinates (0, 0 or clearly wrong values)
    valid_coords = coords[(coords['Latitude'] > 30) & (coords['Latitude'] < 50) & 
                          (coords['Longitude'] > -100) & (coords['Longitude'] < -70)]
    
    # Convert to list of [lat, lng]
    heatmap_data = valid_coords.values.tolist()
    
    # Ensure we have at least some data to display
    if len(heatmap_data) == 0:
        # If no valid coordinates, return Chicago center
        heatmap_data = [[41.8781, -87.6298]]
    
    return jsonify(heatmap_data)

@main_bp.route('/api/crime-types')
def get_crime_types():
    global crime_data
    if crime_data is None:
        crime_data = load_data()
    
    crime_types = sorted(crime_data['Primary Type'].unique().tolist())
    return jsonify(crime_types)

@main_bp.route('/api/years')
def get_years():
    global crime_data
    if crime_data is None:
        crime_data = load_data()
    
    years = sorted(crime_data['Year'].unique().tolist())
    return jsonify(years)

@main_bp.route('/api/districts')
def get_districts():
    global crime_data
    if crime_data is None:
        crime_data = load_data()
    
    districts = sorted(crime_data['District'].dropna().unique().astype(int).tolist())
    return jsonify(districts)

@main_bp.route('/api/time-series')
def get_time_series():
    global crime_data
    if crime_data is None:
        crime_data = load_data()
    
    # Query parameters
    crime_type = request.args.get('type')
    
    # Apply filters
    filtered_data = crime_data.copy()
    if crime_type:
        filtered_data = filtered_data[filtered_data['Primary Type'] == crime_type]
    
    # Group by month and count crimes
    filtered_data['Month'] = filtered_data['Date'].dt.to_period('M')
    monthly_counts = filtered_data.groupby('Month').size()
    
    # Convert to list of [timestamp, count] for chart
    time_series = [[pd.Timestamp(date.to_timestamp()).isoformat(), count] 
                  for date, count in monthly_counts.items()]
    
    return jsonify(time_series)

@main_bp.route('/api/clusters')
def get_clusters():
    global crime_data
    if crime_data is None:
        crime_data = load_data()
    
    # Query parameters for filtering
    year = request.args.get('year')
    crime_type = request.args.get('type')
    district = request.args.get('district')
    
    # Apply filters
    filtered_data = crime_data.copy()
    if year:
        filtered_data = filtered_data[filtered_data['Year'] == int(year)]
    if crime_type:
        filtered_data = filtered_data[filtered_data['Primary Type'] == crime_type]
    if district:
        filtered_data = filtered_data[filtered_data['District'] == int(district)]
    
    # Ensure we have enough data points
    if len(filtered_data) < 100:
        return jsonify({
            'n_clusters': 0,
            'cluster_centers': [],
            'cluster_counts': {},
            'crime_type': crime_type
        })
    
    # Perform clustering (limit to 15,000 points for performance)
    sample_size = min(15000, len(filtered_data))
    sample_data = filtered_data.sample(sample_size, random_state=42)
    
    # Only include necessary columns for clustering to save memory
    sample_data = sample_data[['Latitude', 'Longitude']].copy()
    
    # Perform the clustering
    cluster_results = perform_cluster_analysis(sample_data, crime_type)
    
    return jsonify(cluster_results)

@main_bp.route('/api/arrest-prediction')
def get_arrest_prediction():
    global crime_data
    if crime_data is None:
        crime_data = load_data()
    
    # Query parameters for filtering
    year = request.args.get('year')
    crime_type = request.args.get('type')
    
    # Apply filters
    filtered_data = crime_data.copy()
    if year:
        filtered_data = filtered_data[filtered_data['Year'] == int(year)]
    if crime_type:
        filtered_data = filtered_data[filtered_data['Primary Type'] == crime_type]
    
    # Perform prediction (limit to 10,000 points for performance)
    sample_data = filtered_data.sample(min(10000, len(filtered_data)))
    prediction_results = predict_arrest_probability(sample_data)
    
    return jsonify(prediction_results)

@main_bp.route('/api/crime-trends')
def get_crime_trends():
    global crime_data
    if crime_data is None:
        crime_data = load_data()
    
    # Query parameters for filtering
    year = request.args.get('year')
    crime_type = request.args.get('type')
    district = request.args.get('district')
    
    # Apply filters
    filtered_data = crime_data.copy()
    if year:
        filtered_data = filtered_data[filtered_data['Year'] == int(year)]
    if crime_type:
        filtered_data = filtered_data[filtered_data['Primary Type'] == crime_type]
    if district:
        filtered_data = filtered_data[filtered_data['District'] == int(district)]
    
    # Analyze trends with the filtered data
    trend_results = analyze_crime_trends(filtered_data)
    
    # Additional check for infinity values or extreme values
    if 'increasing_crimes' in trend_results:
        # Filter out any remaining infinity values
        trend_results['increasing_crimes'] = [
            {
                'crime_type': crime['crime_type'],
                'avg_monthly_change': min(40.0, abs(crime['avg_monthly_change'])) if crime['avg_monthly_change'] > 0 else crime['avg_monthly_change']
            }
            for crime in trend_results['increasing_crimes']
            if not np.isinf(crime['avg_monthly_change']) and not np.isnan(crime['avg_monthly_change'])
        ]
    
    if 'decreasing_crimes' in trend_results:
        trend_results['decreasing_crimes'] = [
            {
                'crime_type': crime['crime_type'],
                'avg_monthly_change': max(-40.0, -abs(crime['avg_monthly_change'])) if crime['avg_monthly_change'] < 0 else crime['avg_monthly_change']
            }
            for crime in trend_results['decreasing_crimes']
            if not np.isinf(crime['avg_monthly_change']) and not np.isnan(crime['avg_monthly_change']) 
        ]
    
    return jsonify(trend_results)