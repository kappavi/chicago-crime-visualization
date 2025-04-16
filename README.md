# Chicago Crime Data Visualization

An interactive web application for visualizing and analyzing crime patterns in Chicago using post-COVID data. This application enables users to explore crime trends, identify hotspots, and gain insights through advanced analytics.

## Features

- **Interactive Heatmap**: Visualize crime hotspots across Chicago
- **Filtering Capabilities**: Filter data by year, crime type, and district
- **Statistical Dashboards**: View crime statistics and trends over time
- **Advanced Analytics**:
  - Crime Clustering: Identify crime hotspots using DBSCAN clustering
  - Arrest Prediction: Analyze factors influencing arrest probability using machine learning
  - Trend Analysis: Discover increasing and decreasing crime types over time

## Technology Stack

- **Backend**: Python, Flask, Pandas, Scikit-learn
- **Frontend**: JavaScript, HTML, CSS, Chart.js, Leaflet.js
- **Data Processing**: Pandas, NumPy
- **Machine Learning**: DBSCAN clustering, Random Forest classification

## Installation

1. Clone the repository
2. Install Python dependencies:
```
pip install -r requirements.txt
```
3. Place the Chicago crime dataset at `data/raw_data.csv`
4. Start the application:
```
cd backend
python run.py
```
5. Open your browser and navigate to `http://localhost:9001`

## Data Source

The application uses the Chicago crime dataset, which includes details such as:
- Crime type and description
- Location information
- Arrest status
- Date and time
- District and ward information

## Usage

1. **Explore the Crime Map**: Use the heatmap to identify high-crime areas
2. **Apply Filters**: Narrow down the data by year, crime type, or district
3. **Analyze Trends**: View charts showing crime distributions and trends over time
4. **Use Advanced Analytics**:
   - Run clustering to identify crime hotspots
   - Run the prediction model to understand factors affecting arrests
   - Analyze crime trends to see which crime types are increasing or decreasing

## Research Applications

This visualization tool can be used to:
- Understand spatial and temporal crime patterns in Chicago
- Compare crime trends in Chicago with other metropolitan areas
- Inform policy decisions for urban safety
- Identify factors that influence crime rates and arrest probabilities 