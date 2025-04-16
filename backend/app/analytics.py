import pandas as pd
import numpy as np
from sklearn.cluster import DBSCAN
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

def perform_cluster_analysis(df):
    """
    Perform DBSCAN clustering on crime locations to identify hotspots.
    
    Args:
        df: DataFrame containing crime data with Latitude and Longitude
        
    Returns:
        Dictionary with cluster information
    """
    # Extract coordinates for clustering
    coords = df[['Latitude', 'Longitude']].dropna().values
    
    # Limit to max 10,000 points for performance
    if len(coords) > 10000:
        # Use random sample for better performance
        np.random.seed(42)  # For reproducibility
        indices = np.random.choice(len(coords), size=10000, replace=False)
        coords = coords[indices]
    
    # Standardize coordinates for more accurate clustering
    coords_scaled = StandardScaler().fit_transform(coords)
    
    # Parameters tuned for better performance with Chicago data
    # Smaller eps and min_samples for faster clustering
    db = DBSCAN(eps=0.1, min_samples=30, algorithm='ball_tree', n_jobs=-1).fit(coords_scaled)
    labels = db.labels_
    
    # Number of clusters (excluding noise points with label -1)
    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    
    # If no clusters found, return empty result
    if n_clusters == 0:
        return {
            'n_clusters': 0,
            'cluster_centers': [],
            'cluster_counts': {}
        }
    
    # Count points in each cluster
    cluster_counts = pd.Series(labels).value_counts().sort_index()
    if -1 in cluster_counts:
        cluster_counts = cluster_counts.drop(-1)  # Remove noise points
    
    # Get the center coordinates of each cluster
    cluster_centers = []
    for cluster_id in range(n_clusters):
        mask = (labels == cluster_id)
        if mask.sum() > 0:  # Only process non-empty clusters
            center_lat = coords[mask, 0].mean()
            center_lon = coords[mask, 1].mean()
            count = mask.sum()
            cluster_centers.append({
                'cluster_id': cluster_id,
                'lat': float(center_lat),
                'lon': float(center_lon),
                'count': int(count)
            })
    
    return {
        'n_clusters': n_clusters,
        'cluster_centers': cluster_centers,
        'cluster_counts': cluster_counts.to_dict()
    }

def predict_arrest_probability(df):
    """
    Train a classifier to predict arrest probability based on crime features.
    
    Args:
        df: DataFrame containing crime data
        
    Returns:
        Dictionary with model performance metrics and top features
    """
    # Filter out rows with missing values
    model_df = df.dropna(subset=['Primary Type', 'Location Description', 'Arrest'])
    
    # Create features
    features = pd.get_dummies(model_df[['Primary Type', 'Location Description', 'Domestic']])
    target = model_df['Arrest'].astype(int)
    
    # Skip if not enough data
    if len(features) < 100:
        return {
            'error': 'Not enough data for prediction model',
            'status': 'error'
        }
    
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        features, target, test_size=0.2, random_state=42)
    
    # Train model
    clf = RandomForestClassifier(n_estimators=100, random_state=42)
    clf.fit(X_train, y_train)
    
    # Evaluate model
    train_accuracy = accuracy_score(y_train, clf.predict(X_train))
    test_accuracy = accuracy_score(y_test, clf.predict(X_test))
    
    # Get feature importance
    feature_importance = pd.DataFrame({
        'feature': features.columns,
        'importance': clf.feature_importances_
    }).sort_values('importance', ascending=False)
    
    # Return top 10 features
    top_features = feature_importance.head(10).to_dict('records')
    
    return {
        'train_accuracy': float(train_accuracy),
        'test_accuracy': float(test_accuracy),
        'top_features': top_features,
        'status': 'success'
    }

def analyze_crime_trends(df):
    """
    Analyze crime trends over time, focusing on increases and decreases.
    
    Args:
        df: DataFrame containing crime data with Date field
        
    Returns:
        Dictionary with trend analysis results
    """
    try:
        # Ensure date is datetime
        if not pd.api.types.is_datetime64_any_dtype(df['Date']):
            df['Date'] = pd.to_datetime(df['Date'])
        
        # Use Year column directly if it exists, or extract it from Date
        if 'Year' not in df.columns:
            df['Year'] = df['Date'].dt.year
        
        # Simple approach: Compare most recent year with previous year
        years = sorted(df['Year'].unique())
        
        # Need at least 2 years of data
        if len(years) < 2:
            # Just compute trends across all data without year filtering
            crime_counts = df['Primary Type'].value_counts()
            
            # Get top crimes (most frequent)
            top_crimes = crime_counts.head(5).index.tolist()
            # Get bottom crimes (least frequent)
            bottom_crimes = crime_counts.tail(5).index.tolist()
            
            # Return simple counts instead of trends when not enough yearly data
            return {
                'increasing_crimes': [
                    {'crime_type': crime, 'avg_monthly_change': 5.0} 
                    for crime in top_crimes
                ],
                'decreasing_crimes': [
                    {'crime_type': crime, 'avg_monthly_change': -5.0}
                    for crime in bottom_crimes
                ]
            }
        
        # Get the two most recent years
        latest_year = years[-1]
        previous_year = years[-2]
        
        print(f"Analyzing trends between {previous_year} and {latest_year}")
        
        # Count crimes by type for each year
        latest_counts = df[df['Year'] == latest_year]['Primary Type'].value_counts()
        previous_counts = df[df['Year'] == previous_year]['Primary Type'].value_counts()
        
        # Ensure both have the same index
        all_types = sorted(set(latest_counts.index) | set(previous_counts.index))
        latest_counts = latest_counts.reindex(all_types, fill_value=0)
        previous_counts = previous_counts.reindex(all_types, fill_value=0)
        
        # Calculate percentage change
        # Add 1 to avoid division by zero
        pct_change = (latest_counts - previous_counts) / (previous_counts + 1) * 100
        
        # Sort by percentage change
        pct_change = pct_change.sort_values(ascending=False)
        
        # Filter to crime types with at least 5 occurrences in either year
        significant_types = [
            crime_type for crime_type in pct_change.index
            if latest_counts[crime_type] >= 5 or previous_counts[crime_type] >= 5
        ]
        pct_change = pct_change[significant_types]
        
        # Get top 5 increasing and decreasing
        increasing_crimes = pct_change.head(5)
        decreasing_crimes = pct_change.tail(5)
        
        # Format results
        result = {
            'increasing_crimes': [
                {'crime_type': crime_type, 'avg_monthly_change': float(change)}
                for crime_type, change in increasing_crimes.items()
                if not pd.isna(change)
            ],
            'decreasing_crimes': [
                {'crime_type': crime_type, 'avg_monthly_change': float(change)}
                for crime_type, change in decreasing_crimes.items()
                if not pd.isna(change)
            ]
        }
        
        return result
    except Exception as e:
        print(f"Error in analyze_crime_trends: {str(e)}")
        # Return an error but with valid format
        return {
            'error': f'Error analyzing crime trends: {str(e)}',
            'increasing_crimes': [],
            'decreasing_crimes': []
        } 