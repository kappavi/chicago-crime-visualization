document.addEventListener('DOMContentLoaded', function() {
    // Initialize global variables
    let map, heatLayer, clusterMap, clusterMarkers = [];
    let currentCrimeData = []; // To store the current crime data for table operations
    let tableSortBy = 'Date';
    let tableSortDirection = 'desc';
    let tablePageSize = 10;
    let tableCurrentPage = 1;
    let tableMaxPage = 1;
    let crimeTypeChart, timeSeriesChart;
    
    // DOM elements
    const loadingElement = document.getElementById('loading');
    const mainContentElement = document.getElementById('main-content');
    const yearFilterElement = document.getElementById('year-filter');
    const crimeTypeFilterElement = document.getElementById('crime-type-filter');
    const districtFilterElement = document.getElementById('district-filter');
    const applyFiltersButton = document.getElementById('apply-filters');
    const resetFiltersButton = document.getElementById('reset-filters');
    const runClusteringButton = document.getElementById('run-clustering');
    const runPredictionButton = document.getElementById('run-prediction');
    const analyzeTrendsButton = document.getElementById('analyze-trends');
    
    // Initialize the application
    init();
    
    async function init() {
        try {
            // Show loading
            showLoading();
            
            // Show main content with a small delay to ensure CSS is loaded
            setTimeout(() => {
                if (mainContentElement) {
                    mainContentElement.style.display = 'block';
                }
            }, 500);
            
            // Initialize maps first and wait for them to be ready
            try {
                await initMap();
                console.log('Main map initialized successfully');
                await initClusterMap();
                console.log('Cluster map initialized successfully');
            } catch (error) {
                console.error('Error initializing maps:', error);
                // Continue even if map initialization fails
            }
            
            // Load filter options
            try {
                await Promise.all([
                    loadYears(),
                    loadCrimeTypes(),
                    loadDistricts()
                ]);
                console.log('Filter options loaded successfully');
            } catch (error) {
                console.error('Error loading filter options:', error);
                // Continue execution even if filter loading fails
            }
            
            // Load initial data with a slight delay to ensure maps are ready
            setTimeout(async () => {
                try {
                    await loadData();
                    console.log('Initial data loaded successfully');
                    
                    // Ensure we have summary data by explicitly loading it
                    try {
                        const summaryResponse = await fetch('/api/crime-summary');
                        if (summaryResponse.ok) {
                            const summaryData = await summaryResponse.json();
                            updateSummary(summaryData);
                            console.log('Summary data loaded successfully');
                        }
                    } catch (summaryError) {
                        console.error('Error loading summary data:', summaryError);
                    }
                    
                    // Hide loading now that data is loaded
                    hideLoading();
                } catch (dataError) {
                    console.error('Error loading initial data:', dataError);
                    hideLoading();
                    
                    // Show error message in the table
                    const tableBody = document.querySelector('#crime-table tbody');
                    if (tableBody) {
                        tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Failed to load crime data. Please try again later.</td></tr>';
                    }
                }
            }, 1000);
            
            // Add event listeners
            applyFiltersButton.addEventListener('click', applyFilters);
            resetFiltersButton.addEventListener('click', resetFilters);
            runClusteringButton.addEventListener('click', runClustering);
            runPredictionButton.addEventListener('click', runPrediction);
            analyzeTrendsButton.addEventListener('click', analyzeTrends);
            
            // Add table sorting and pagination event listeners
            document.getElementById('table-sort-by').addEventListener('change', function() {
                tableSortBy = this.value;
                tableCurrentPage = 1; // Reset to first page on sort change
                if (currentCrimeData.length > 0) {
                    updateTable(currentCrimeData);
                }
            });
            
            document.getElementById('table-sort-direction').addEventListener('change', function() {
                tableSortDirection = this.value;
                if (currentCrimeData.length > 0) {
                    updateTable(currentCrimeData);
                }
            });
            
            document.getElementById('table-page-size').addEventListener('change', function() {
                tablePageSize = parseInt(this.value, 10);
                tableCurrentPage = 1; // Reset to first page on page size change
                if (currentCrimeData.length > 0) {
                    updateTable(currentCrimeData);
                }
            });
            
            document.getElementById('table-prev-page').addEventListener('click', function(e) {
                e.preventDefault();
                if (tableCurrentPage > 1) {
                    tableCurrentPage--;
                    updateTable(currentCrimeData);
                }
            });
            
            document.getElementById('table-next-page').addEventListener('click', function(e) {
                e.preventDefault();
                if (tableCurrentPage < tableMaxPage) {
                    tableCurrentPage++;
                    updateTable(currentCrimeData);
                }
            });
            
            // Add click event for table headers for column sorting
            document.querySelectorAll('#crime-table th[data-sort]').forEach(header => {
                header.addEventListener('click', function() {
                    const sortField = this.getAttribute('data-sort');
                    if (sortField) {
                        // Toggle direction if clicking on the same column
                        if (tableSortBy === sortField) {
                            tableSortDirection = tableSortDirection === 'asc' ? 'desc' : 'asc';
                        } else {
                            tableSortBy = sortField;
                            tableSortDirection = 'asc'; // Default to ascending for new column
                        }
                        
                        // Update the sort by dropdown to match
                        const sortBySelect = document.getElementById('table-sort-by');
                        if (sortBySelect) {
                            sortBySelect.value = tableSortBy;
                        }
                        
                        // Update the sort direction dropdown to match
                        const sortDirSelect = document.getElementById('table-sort-direction');
                        if (sortDirSelect) {
                            sortDirSelect.value = tableSortDirection;
                        }
                        
                        updateTable(currentCrimeData);
                    }
                });
            });
            
            // Add tab switching handlers to resize maps
            document.querySelectorAll('button[data-bs-toggle="tab"]').forEach(tab => {
                tab.addEventListener('shown.bs.tab', function (e) {
                    if (e.target.id === 'clusters-tab' && clusterMap) {
                        setTimeout(() => clusterMap.invalidateSize(), 50);
                    }
                    if (map) {
                        setTimeout(() => map.invalidateSize(), 50);
                    }
                });
            });
            
            // Handle window resize events
            window.addEventListener('resize', function() {
                if (map) map.invalidateSize();
                if (clusterMap) clusterMap.invalidateSize();
            });
            
        } catch (error) {
            console.error('Error initializing application:', error);
            alert('Failed to initialize the application. Please try again later.');
            hideLoading();
        }
    }
    
    function showLoading() {
        loadingElement.style.display = 'flex';
    }
    
    function hideLoading() {
        loadingElement.style.display = 'none';
    }
    
    function initMap() {
        return new Promise((resolve, reject) => {
            try {
                // Get the map container element
                const mapContainer = document.getElementById('map');
                if (!mapContainer) {
                    console.error('Map container not found');
                    reject(new Error('Map container not found'));
                    return;
                }
                
                // Make sure the map container is visible
                mapContainer.style.display = 'block';
                mapContainer.style.minHeight = '400px';
                mapContainer.style.height = '100%';
                
                // Show map tab to ensure it's visible
                const mapTab = document.getElementById('map-tab');
                if (mapTab) {
                    setTimeout(() => {
                        try {
                            mapTab.click();
                        } catch (tabError) {
                            console.warn('Could not automatically click map tab:', tabError);
                        }
                    }, 100);
                }
                
                // Create a map centered on Chicago with optimized settings
                map = L.map('map', {
                    center: [41.8781, -87.6298],
                    zoom: 10,
                    preferCanvas: true, // Use canvas for better performance
                    zoomControl: true,
                    minZoom: 9,
                    maxZoom: 16, // Limit max zoom for performance
                    attributionControl: true,
                    fadeAnimation: false, // Disable animations for performance
                    markerZoomAnimation: false // Disable animations for performance
                });
                
                // Add a base map layer - use a faster CDN
                L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                    subdomains: 'abcd',
                    maxZoom: 19
                }).addTo(map);
                
                // Force resize to ensure map renders correctly and resolve without adding heat layer yet
                setTimeout(() => {
                    map.invalidateSize(true);
                    console.log('Map initialized with container dimensions:', 
                              mapContainer.clientWidth, 'x', mapContainer.clientHeight);
                    resolve();
                }, 500);
                
            } catch (error) {
                console.error('Error initializing map:', error);
                reject(error);
            }
        });
    }
    
    function initClusterMap() {
        return new Promise((resolve, reject) => {
            try {
                // Get the cluster map container element
                const clusterMapContainer = document.getElementById('cluster-map');
                if (!clusterMapContainer) {
                    console.error('Cluster map container not found');
                    // Resolve anyway, as the cluster map is not critical
                    resolve();
                    return;
                }
                
                // Make sure the cluster map container is visible
                clusterMapContainer.style.display = 'block';
                
                // Create a map for clusters centered on Chicago with optimized settings
                clusterMap = L.map('cluster-map', {
                    center: [41.8781, -87.6298],
                    zoom: 10,
                    preferCanvas: true,
                    zoomControl: true,
                    minZoom: 9,
                    maxZoom: 16,
                    attributionControl: true,
                    fadeAnimation: false,
                    markerZoomAnimation: false
                });
                
                // Add a base map layer - use a faster CDN
                L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                    subdomains: 'abcd',
                    maxZoom: 19
                }).addTo(clusterMap);
                
                // Force resize to ensure map renders correctly
                setTimeout(() => {
                    clusterMap.invalidateSize(true);
                    resolve();
                }, 300);
            } catch (error) {
                console.error('Error initializing cluster map:', error);
                // Resolve anyway, as the cluster map is not critical
                resolve();
            }
        });
    }
    
    async function loadYears() {
        try {
            const response = await fetch('/api/years');
            const years = await response.json();
            
            // Populate year filter dropdown
            yearFilterElement.innerHTML = '<option value="">All Years</option>';
            years.forEach(year => {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year;
                yearFilterElement.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading years:', error);
        }
    }
    
    async function loadCrimeTypes() {
        try {
            const response = await fetch('/api/crime-types');
            const crimeTypes = await response.json();
            
            // Populate crime type filter dropdown
            crimeTypeFilterElement.innerHTML = '<option value="">All Crime Types</option>';
            crimeTypes.forEach(type => {
                const option = document.createElement('option');
                option.value = type;
                option.textContent = type;
                crimeTypeFilterElement.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading crime types:', error);
        }
    }
    
    async function loadDistricts() {
        try {
            const response = await fetch('/api/districts');
            const districts = await response.json();
            
            // Populate district filter dropdown
            districtFilterElement.innerHTML = '<option value="">All Districts</option>';
            districts.forEach(district => {
                const option = document.createElement('option');
                option.value = district;
                option.textContent = district;
                districtFilterElement.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading districts:', error);
        }
    }
    
    async function loadData() {
        try {
            console.log('Loading data with filters:', 
                       yearFilterElement.value ? `year=${yearFilterElement.value}` : 'none',
                       crimeTypeFilterElement.value ? `type=${crimeTypeFilterElement.value}` : '',
                       districtFilterElement.value ? `district=${districtFilterElement.value}` : '');
            
            showLoading();
            
            // Build query string
            let queryParams = new URLSearchParams();
            if (yearFilterElement.value) queryParams.append('year', yearFilterElement.value);
            if (crimeTypeFilterElement.value) queryParams.append('type', crimeTypeFilterElement.value);
            if (districtFilterElement.value) queryParams.append('district', districtFilterElement.value);
            const queryString = queryParams.toString();
            
            try {
                // Fetch data in parallel for better performance
                await Promise.all([
                    // Load crime data
                    (async () => {
                        try {
                            // Fetch crime data for table
                            const crimeResponse = await fetch(`/api/crime-data?${queryString}`);
                            if (!crimeResponse.ok) throw new Error(`Crime data request failed with status ${crimeResponse.status}`);
                            const crimeData = await crimeResponse.json();
                            
                            // Update table with crime data
                            updateTable(crimeData);
                            
                            // Store the crime data for later use
                            currentCrimeData = [...crimeData];
                            
                            // Log the received data length
                            console.log(`Received ${crimeData.length.toLocaleString()} crime data records`);
                        } catch (error) {
                            console.error('Error loading crime data:', error);
                            currentCrimeData = []; // Clear on error
                            updateTable([]); // Update table with empty data
                            throw error; // Re-throw to be caught by the outer try/catch
                        }
                    })(),
                    
                    // Load heatmap data
                    (async () => {
                        try {
                            // Check if map is initialized before trying to update the heatmap
                            if (!map) {
                                console.error('Map is not initialized, cannot update heatmap');
                                // Wait a moment and check again
                                await new Promise(resolve => setTimeout(resolve, 500));
                                
                                if (!map) {
                                    console.warn('Map still not initialized after waiting');
                                    return; // Skip heatmap update if map is still not ready
                                }
                            }
                            
                            // Fetch heatmap data
                            const heatmapResponse = await fetch(`/api/heatmap-data?${queryString}`);
                            if (!heatmapResponse.ok) throw new Error(`Heatmap data request failed with status ${heatmapResponse.status}`);
                            const heatmapData = await heatmapResponse.json();
                            
                            console.log(`Received ${heatmapData.length} heatmap data points`);
                            
                            // Update heatmap
                            updateHeatmap(heatmapData);
                        } catch (error) {
                            console.error('Error fetching heatmap data:', error);
                            // Handle empty heatmap
                            if (map) {
                                updateHeatmap([[41.8781, -87.6298]]); // Default to Chicago center
                            }
                        }
                    })(),
                    
                    // Load summary data
                    (async () => {
                        try {
                            // Fetch summary data
                            const summaryResponse = await fetch('/api/crime-summary');
                            if (!summaryResponse.ok) throw new Error(`Summary request failed with status ${summaryResponse.status}`);
                            const summaryData = await summaryResponse.json();
                            
                            // Update summary
                            updateSummary(summaryData);
                            
                            // Update crime types chart (part of summary data)
                            if (summaryData.crimes_by_type) {
                                updateCrimeTypesChart(summaryData.crimes_by_type);
                            }
                        } catch (error) {
                            console.error('Error fetching summary data:', error);
                            // Set default summary values
                            document.getElementById('total-crimes').textContent = '0';
                            document.getElementById('arrest-rate').textContent = '0%';
                            document.getElementById('domestic-rate').textContent = '0%';
                            document.getElementById('crime-types-count').textContent = '0';
                        }
                    })(),
                    
                    // Load time series data
                    (async () => {
                        try {
                            // Fetch time series data
                            const timeSeriesResponse = await fetch(`/api/time-series?${queryString}`);
                            if (!timeSeriesResponse.ok) throw new Error(`Time series request failed with status ${timeSeriesResponse.status}`);
                            const timeSeriesData = await timeSeriesResponse.json();
                            
                            // Update time series chart
                            updateTimeSeriesChart(timeSeriesData);
                        } catch (error) {
                            console.error('Error fetching time series data:', error);
                            // Handle empty time series
                            updateTimeSeriesChart([]);
                        }
                    })()
                ]);
            } catch (parallelError) {
                console.error('Error loading data in parallel:', parallelError);
            }
            
            hideLoading();
        } catch (error) {
            console.error('Error loading data:', error);
            hideLoading();
            alert('Failed to load crime data. Please try again later.');
        }
    }
    
    function updateSummary(summaryData) {
        // Update summary numbers
        document.getElementById('total-crimes').textContent = summaryData.total_crimes.toLocaleString();
        document.getElementById('arrest-rate').textContent = summaryData.arrest_rate.toFixed(1) + '%';
        document.getElementById('domestic-rate').textContent = summaryData.domestic_rate.toFixed(1) + '%';
        document.getElementById('crime-types-count').textContent = Object.keys(summaryData.crimes_by_type).length;
    }
    
    function updateHeatmap(heatmapData) {
        try {
            console.log('Updating heatmap with', heatmapData.length, 'points');
            
            // Check if map is properly initialized
            if (!map) {
                console.error('Map is not initialized yet');
                // Attempt to initialize the map if needed
                setTimeout(() => {
                    if (map) updateHeatmap(heatmapData);
                }, 1000);
                return;
            }
            
            // Remove existing heatmap layer if it exists
            if (heatLayer && map.hasLayer(heatLayer)) {
                map.removeLayer(heatLayer);
                heatLayer = null;
            }
            
            // Make sure the map container is visible and has dimensions
            const mapContainer = document.getElementById('map');
            if (!mapContainer || mapContainer.clientWidth === 0 || mapContainer.clientHeight === 0) {
                console.error('Map container not visible or has zero dimensions');
                
                // Show the tab containing the map to make it visible
                const mapTab = document.getElementById('map-tab');
                if (mapTab) {
                    mapTab.click();
                }
                
                // Force map to be visible
                if (mapContainer) {
                    mapContainer.style.display = 'block';
                    mapContainer.style.height = '400px'; // Set a default height
                }
                
                // Force invalidate size and try again
                map.invalidateSize(true);
                setTimeout(() => updateHeatmap(heatmapData), 500); // Try again in 500ms
                return;
            }
            
            // Only proceed if we have data
            if (heatmapData && heatmapData.length > 0) {
                // Add intensity values to the heatmap points for better visualization
                const heatPoints = heatmapData.map(point => [
                    point[0], // latitude
                    point[1], // longitude
                    0.6 // intensity - uniform value for all points
                ]);
                
                // Force a map update to ensure proper rendering before adding the heat layer
                map.invalidateSize(true);
                
                // Wait a short time to ensure the map is properly rendered
                setTimeout(() => {
                    try {
                        // Create a new heatmap layer with the data
                        heatLayer = L.heatLayer(heatPoints, {
                            radius: 20,
                            blur: 15,
                            maxZoom: 14,
                            max: 1.0,
                            gradient: {0.4: 'blue', 0.6: 'cyan', 0.7: 'lime', 0.8: 'yellow', 1.0: 'red'}
                        });
                        
                        // Add the heat layer to the map
                        heatLayer.addTo(map);
                        
                        // Fit the map to the heatmap data bounds
                        try {
                            const bounds = L.latLngBounds(heatPoints.map(point => [point[0], point[1]]));
                            if (bounds.isValid()) {
                                map.fitBounds(bounds, {
                                    padding: [30, 30],
                                    maxZoom: 13
                                });
                            } else {
                                // Default to Chicago if bounds are invalid
                                map.setView([41.8781, -87.6298], 10);
                            }
                        } catch (error) {
                            console.error('Error fitting to heatmap bounds:', error);
                            map.setView([41.8781, -87.6298], 10);
                        }
                    } catch (innerError) {
                        console.error('Error creating heat layer:', innerError);
                        map.setView([41.8781, -87.6298], 10);
                    }
                }, 300);
            } else {
                console.warn('No valid heatmap data received');
                
                // Default to Chicago center without adding heat layer
                map.setView([41.8781, -87.6298], 10);
            }
        } catch (error) {
            console.error('Error updating heatmap:', error);
            
            // Reset to a default state if there's an error
            if (map) {
                if (heatLayer && map.hasLayer(heatLayer)) {
                    map.removeLayer(heatLayer);
                    heatLayer = null;
                }
                
                // Set view to Chicago without adding heat layer
                map.setView([41.8781, -87.6298], 10);
            }
        }
    }
    
    function updateCharts(summaryData, timeSeriesData) {
        // Update crime types chart
        updateCrimeTypesChart(summaryData.crimes_by_type);
        
        // Update time series chart
        updateTimeSeriesChart(timeSeriesData);
    }
    
    function updateCrimeTypesChart(crimesByType) {
        // Check if we have data
        if (!crimesByType || Object.keys(crimesByType).length === 0) {
            if (crimeTypeChart) {
                crimeTypeChart.data.labels = [];
                crimeTypeChart.data.datasets[0].data = [];
                crimeTypeChart.update();
            }
            return;
        }
        
        // Get top 10 crime types by count
        const sortedCrimes = Object.entries(crimesByType)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        
        const labels = sortedCrimes.map(item => item[0]);
        const data = sortedCrimes.map(item => item[1]);
        
        // Create or update chart
        if (crimeTypeChart) {
            crimeTypeChart.data.labels = labels;
            crimeTypeChart.data.datasets[0].data = data;
            crimeTypeChart.update();
        } else {
            const ctx = document.getElementById('crime-types-chart').getContext('2d');
            crimeTypeChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Number of Crimes',
                        data: data,
                        backgroundColor: 'rgba(54, 162, 235, 0.7)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
        }
    }
    
    function updateTimeSeriesChart(timeSeriesData) {
        // Check if we have data
        if (!timeSeriesData || timeSeriesData.length === 0) {
            if (timeSeriesChart) {
                timeSeriesChart.data.labels = [];
                timeSeriesChart.data.datasets[0].data = [];
                timeSeriesChart.update();
            }
            return;
        }
        
        // Format data for time series chart
        const labels = timeSeriesData.map(item => {
            const date = new Date(item[0]);
            return `${date.getFullYear()}-${date.getMonth() + 1}`;
        });
        const data = timeSeriesData.map(item => item[1]);
        
        // Create or update chart
        if (timeSeriesChart) {
            timeSeriesChart.data.labels = labels;
            timeSeriesChart.data.datasets[0].data = data;
            timeSeriesChart.update();
        } else {
            const ctx = document.getElementById('time-series-chart').getContext('2d');
            timeSeriesChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Number of Crimes',
                        data: data,
                        backgroundColor: 'rgba(75, 192, 192, 0.2)',
                        borderColor: 'rgba(75, 192, 192, 1)',
                        borderWidth: 2,
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
        }
    }
    
    function updateTable(crimeData) {
        const tableBody = document.querySelector('#crime-table tbody');
        if (!tableBody) {
            console.error('Crime table body element not found');
            return;
        }
        
        tableBody.innerHTML = '';
        
        // Check if we have data
        if (!crimeData || crimeData.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center">No data available</td></tr>';
            
            // Update table info and pagination
            document.getElementById('table-showing-start').textContent = '0';
            document.getElementById('table-showing-end').textContent = '0';
            document.getElementById('table-total-entries').textContent = '0';
            
            // Clear pagination
            const pagination = document.getElementById('table-pagination');
            if (pagination) {
                pagination.innerHTML = `
                    <li class="page-item disabled">
                        <a class="page-link" href="#" id="table-prev-page">Previous</a>
                    </li>
                    <li class="page-item active">
                        <a class="page-link" href="#">1</a>
                    </li>
                    <li class="page-item disabled">
                        <a class="page-link" href="#" id="table-next-page">Next</a>
                    </li>
                `;
            }
            
            return;
        }
        
        // Store the current crime data for sorting/pagination
        currentCrimeData = [...crimeData];
        
        // Sort data based on current sort settings
        const sortedData = [...crimeData].sort((a, b) => {
            let aValue = a[tableSortBy];
            let bValue = b[tableSortBy];
            
            // Handle special cases and data types
            if (tableSortBy === 'Date') {
                // Convert to date objects for comparison
                aValue = a.Date ? new Date(a.Date) : new Date(0);
                bValue = b.Date ? new Date(b.Date) : new Date(0);
                
                // Check if dates are valid
                if (isNaN(aValue.getTime())) aValue = new Date(0);
                if (isNaN(bValue.getTime())) bValue = new Date(0);
            } else if (typeof aValue === 'string' && typeof bValue === 'string') {
                // Case-insensitive string comparison
                aValue = aValue.toLowerCase();
                bValue = bValue.toLowerCase();
            } else if (aValue === null || aValue === undefined) {
                // Handle null/undefined values
                aValue = tableSortDirection === 'asc' ? '\uffff' : '';
            } else if (bValue === null || bValue === undefined) {
                // Handle null/undefined values
                bValue = tableSortDirection === 'asc' ? '\uffff' : '';
            }
            
            // Perform comparison based on sort direction
            if (tableSortDirection === 'asc') {
                return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
            } else {
                return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
            }
        });
        
        // Calculate pagination
        const totalEntries = sortedData.length;
        tableMaxPage = Math.ceil(totalEntries / tablePageSize);
        
        // Ensure current page is valid
        if (tableCurrentPage > tableMaxPage) {
            tableCurrentPage = tableMaxPage > 0 ? tableMaxPage : 1;
        }
        
        // Calculate starting and ending indices for current page
        const startIndex = (tableCurrentPage - 1) * tablePageSize;
        const endIndex = Math.min(startIndex + tablePageSize, totalEntries);
        
        // Get data for current page
        const pageData = sortedData.slice(startIndex, endIndex);
        
        // Create a document fragment for better performance
        const fragment = document.createDocumentFragment();
        
        // Add rows for current page
        pageData.forEach(crime => {
            const row = document.createElement('tr');
            
            try {
                // Format date
                let formattedDate = 'N/A';
                if (crime.Date) {
                    const date = new Date(crime.Date);
                    if (!isNaN(date.getTime())) {
                        formattedDate = date.toLocaleDateString();
                    }
                }
                
                // Create cells with safe fallbacks
                row.innerHTML = `
                    <td>${formattedDate}</td>
                    <td>${crime['Primary Type'] || 'N/A'}</td>
                    <td>${crime.Description || 'N/A'}</td>
                    <td>${crime['Location Description'] || 'N/A'}</td>
                    <td>${crime.Arrest ? 'Yes' : 'No'}</td>
                    <td>${crime.Domestic ? 'Yes' : 'No'}</td>
                `;
                
                fragment.appendChild(row);
            } catch (error) {
                console.error('Error creating table row for crime:', error, crime);
            }
        });
        
        // Add all rows at once
        tableBody.appendChild(fragment);
        
        // Update table info
        document.getElementById('table-showing-start').textContent = startIndex + 1;
        document.getElementById('table-showing-end').textContent = endIndex;
        document.getElementById('table-total-entries').textContent = totalEntries;
        
        // Update pagination
        updateTablePagination();
    }
    
    // Function to update the table pagination controls
    function updateTablePagination() {
        const pagination = document.getElementById('table-pagination');
        if (!pagination) return;
        
        // Clear existing pagination
        pagination.innerHTML = '';
        
        // Previous button
        const prevLi = document.createElement('li');
        prevLi.className = `page-item ${tableCurrentPage === 1 ? 'disabled' : ''}`;
        prevLi.innerHTML = `<a class="page-link" href="#" id="table-prev-page">Previous</a>`;
        pagination.appendChild(prevLi);
        
        // Add page numbers
        const maxPagesToShow = 5;
        let startPage = Math.max(1, tableCurrentPage - Math.floor(maxPagesToShow / 2));
        let endPage = Math.min(tableMaxPage, startPage + maxPagesToShow - 1);
        
        // Adjust if we're near the end
        if (endPage - startPage + 1 < maxPagesToShow && startPage > 1) {
            startPage = Math.max(1, endPage - maxPagesToShow + 1);
        }
        
        // Add first page and ellipsis if needed
        if (startPage > 1) {
            const firstLi = document.createElement('li');
            firstLi.className = 'page-item';
            firstLi.innerHTML = `<a class="page-link" href="#" data-page="1">1</a>`;
            pagination.appendChild(firstLi);
            
            if (startPage > 2) {
                const ellipsisLi = document.createElement('li');
                ellipsisLi.className = 'page-item disabled';
                ellipsisLi.innerHTML = `<a class="page-link" href="#">...</a>`;
                pagination.appendChild(ellipsisLi);
            }
        }
        
        // Add page numbers
        for (let i = startPage; i <= endPage; i++) {
            const pageLi = document.createElement('li');
            pageLi.className = `page-item ${i === tableCurrentPage ? 'active' : ''}`;
            pageLi.innerHTML = `<a class="page-link" href="#" data-page="${i}">${i}</a>`;
            pagination.appendChild(pageLi);
        }
        
        // Add last page and ellipsis if needed
        if (endPage < tableMaxPage) {
            if (endPage < tableMaxPage - 1) {
                const ellipsisLi = document.createElement('li');
                ellipsisLi.className = 'page-item disabled';
                ellipsisLi.innerHTML = `<a class="page-link" href="#">...</a>`;
                pagination.appendChild(ellipsisLi);
            }
            
            const lastLi = document.createElement('li');
            lastLi.className = 'page-item';
            lastLi.innerHTML = `<a class="page-link" href="#" data-page="${tableMaxPage}">${tableMaxPage}</a>`;
            pagination.appendChild(lastLi);
        }
        
        // Next button
        const nextLi = document.createElement('li');
        nextLi.className = `page-item ${tableCurrentPage === tableMaxPage ? 'disabled' : ''}`;
        nextLi.innerHTML = `<a class="page-link" href="#" id="table-next-page">Next</a>`;
        pagination.appendChild(nextLi);
        
        // Add event listeners for page links
        pagination.querySelectorAll('a[data-page]').forEach(link => {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                const page = parseInt(this.getAttribute('data-page'), 10);
                if (page !== tableCurrentPage) {
                    tableCurrentPage = page;
                    updateTable(currentCrimeData);
                }
            });
        });
        
        // Re-attach event listeners for prev/next buttons
        const prevButton = document.getElementById('table-prev-page');
        if (prevButton) {
            prevButton.addEventListener('click', function(e) {
                e.preventDefault();
                if (tableCurrentPage > 1) {
                    tableCurrentPage--;
                    updateTable(currentCrimeData);
                }
            });
        }
        
        const nextButton = document.getElementById('table-next-page');
        if (nextButton) {
            nextButton.addEventListener('click', function(e) {
                e.preventDefault();
                if (tableCurrentPage < tableMaxPage) {
                    tableCurrentPage++;
                    updateTable(currentCrimeData);
                }
            });
        }
    }
    
    async function applyFilters() {
        try {
            console.log('Applying filters...');
            
            // Show loading first
            showLoading();
            
            // Check if map is initialized
            if (!map) {
                console.error('Map is not initialized, waiting before applying filters');
                // Wait a moment to see if map initializes
                await new Promise(resolve => setTimeout(resolve, 500));
                
                if (!map) {
                    console.warn('Map still not initialized after waiting');
                    // Continue anyway and let loadData handle it
                }
            }
            
            // First directly fetch and update the heatmap for immediate visual feedback
            const year = yearFilterElement.value;
            const crimeType = crimeTypeFilterElement.value;
            const district = districtFilterElement.value;
            
            // Build query string
            let queryParams = new URLSearchParams();
            if (year) queryParams.append('year', year);
            if (crimeType) queryParams.append('type', crimeType);
            if (district) queryParams.append('district', district);
            
            // Log the applied filters
            console.log('Applied filters:', {
                year: year || 'All',
                crimeType: crimeType || 'All',
                district: district || 'All'
            });
            
            // Then load all data
            await loadData();
        } catch (error) {
            console.error('Error applying filters:', error);
            hideLoading();
            alert('Error applying filters. Please try again.');
        }
    }
    
    async function resetFilters() {
        try {
            console.log('Resetting filters...');
            
            // Show loading
            showLoading();
            
            // Reset filter values
            yearFilterElement.value = '';
            crimeTypeFilterElement.value = '';
            districtFilterElement.value = '';
            
            // Check if map is initialized
            if (!map) {
                console.error('Map is not initialized, waiting before loading data');
                // Wait a moment to see if map initializes
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            // Load data with no filters
            await loadData();
        } catch (error) {
            console.error('Error resetting filters:', error);
            hideLoading();
            alert('Error resetting filters. Please try again.');
        }
    }
    
    async function runClustering() {
        try {
            showLoading();
            
            // Clear existing clusters
            clearClusterMarkers();
            
            // Get filter values
            const year = yearFilterElement.value;
            const crimeType = crimeTypeFilterElement.value;
            
            // Build query string
            let queryParams = new URLSearchParams();
            if (year) queryParams.append('year', year);
            if (crimeType) queryParams.append('type', crimeType);
            
            // Fetch cluster data
            const response = await fetch(`/api/clusters?${queryParams.toString()}`);
            const clusterData = await response.json();
            
            // Update UI
            updateClusterInfo(clusterData);
            
            hideLoading();
        } catch (error) {
            console.error('Error running clustering:', error);
            hideLoading();
            alert('Failed to run clustering analysis. Please try again later.');
        }
    }
    
    function clearClusterMarkers() {
        // Remove existing markers
        clusterMarkers.forEach(marker => {
            if (clusterMap) {
                clusterMap.removeLayer(marker);
            }
        });
        clusterMarkers = [];
    }
    
    function updateClusterInfo(clusterData) {
        // Update cluster count with crime type if available
        const clustersCountElement = document.getElementById('clusters-count');
        if (clusterData.crime_type) {
            clustersCountElement.textContent = `${clusterData.n_clusters || 0} clusters identified for "${clusterData.crime_type}"`;
        } else {
            clustersCountElement.textContent = `${clusterData.n_clusters || 0} clusters identified`;
        }
        
        // Update cluster list
        const clusterListElement = document.getElementById('cluster-list');
        clusterListElement.innerHTML = '';
        
        // Check if we have valid cluster data
        if (!clusterData.cluster_centers || clusterData.cluster_centers.length === 0) {
            clusterListElement.innerHTML = '<div class="alert alert-warning">No significant clusters found.</div>';
            return;
        }
        
        // Sort clusters by count (descending)
        const sortedClusters = [...clusterData.cluster_centers].sort((a, b) => b.count - a.count);
        
        // Generate random colors for clusters
        const colors = generateClusterColors(clusterData.n_clusters);
        
        // Create cluster group for better performance
        const clusterGroup = L.layerGroup();
        
        // Add markers to the map (limit to top 20 for performance)
        sortedClusters.slice(0, 20).forEach((cluster, index) => {
            const color = colors[cluster.cluster_id];
            
            // Use circle marker for better performance
            const marker = L.circleMarker([cluster.lat, cluster.lon], {
                radius: Math.min(25, Math.max(10, Math.log(cluster.count) * 5)),
                fillColor: color,
                color: '#000',
                weight: 1,
                opacity: 0.8,
                fillOpacity: 0.6
            });
            
            marker.bindPopup(`
                <strong>Cluster ${cluster.cluster_id + 1}</strong><br>
                Crimes: ${cluster.count.toLocaleString()}<br>
                Latitude: ${cluster.lat.toFixed(4)}<br>
                Longitude: ${cluster.lon.toFixed(4)}
                ${clusterData.crime_type ? `<br>Type: ${clusterData.crime_type}` : ''}
            `);
            
            marker.addTo(clusterGroup);
            clusterMarkers.push(marker);
            
            // Add to list (only top 5)
            if (index < 5) {
                const clusterItem = document.createElement('div');
                clusterItem.className = 'mb-2';
                clusterItem.innerHTML = `
                    <div>
                        <span class="cluster-badge" style="background-color: ${color};"></span>
                        Cluster ${cluster.cluster_id + 1}: ${cluster.count.toLocaleString()} crimes
                    </div>
                    <div class="small text-muted">
                        Location: ${cluster.lat.toFixed(4)}, ${cluster.lon.toFixed(4)}
                    </div>
                `;
                clusterListElement.appendChild(clusterItem);
            }
        });
        
        // Add all markers to map at once (better performance)
        clusterGroup.addTo(clusterMap);
        
        // Fit map to markers if we have any
        if (clusterMarkers.length > 0) {
            try {
                const bounds = clusterGroup.getBounds();
                clusterMap.fitBounds(bounds, {
                    padding: [30, 30],
                    maxZoom: 13 // Limit zoom level for better performance
                });
            } catch (error) {
                console.error('Error fitting map to bounds:', error);
                // Reset view if bounds calculation fails
                clusterMap.setView([41.8781, -87.6298], 10);
            }
        }
    }
    
    function generateClusterColors(count) {
        const colors = [];
        for (let i = 0; i < count; i++) {
            // Generate distinct colors using HSL
            const hue = (i * 360 / count) % 360;
            colors.push(`hsl(${hue}, 70%, 50%)`);
        }
        return colors;
    }
    
    async function runPrediction() {
        try {
            showLoading();
            
            // Get filter values
            const year = yearFilterElement.value;
            const crimeType = crimeTypeFilterElement.value;
            
            // Build query string
            let queryParams = new URLSearchParams();
            if (year) queryParams.append('year', year);
            if (crimeType) queryParams.append('type', crimeType);
            
            // Fetch prediction data
            const response = await fetch(`/api/arrest-prediction?${queryParams.toString()}`);
            const predictionData = await response.json();
            
            // Update UI
            if (predictionData.status === 'success') {
                updatePredictionInfo(predictionData);
            } else {
                alert(predictionData.error || 'Failed to run prediction model.');
            }
            
            hideLoading();
        } catch (error) {
            console.error('Error running prediction:', error);
            hideLoading();
            alert('Failed to run prediction model. Please try again later.');
        }
    }
    
    function updatePredictionInfo(predictionData) {
        // Update accuracy stats
        document.getElementById('train-accuracy').textContent = (predictionData.train_accuracy * 100).toFixed(1) + '%';
        document.getElementById('test-accuracy').textContent = (predictionData.test_accuracy * 100).toFixed(1) + '%';
        
        // Update feature importance
        const featureElement = document.getElementById('feature-importance');
        featureElement.innerHTML = '';
        
        // Find maximum importance for scaling
        const maxImportance = Math.max(...predictionData.top_features.map(f => f.importance));
        
        predictionData.top_features.forEach(feature => {
            const featureItem = document.createElement('div');
            featureItem.className = 'mb-3';
            
            // Calculate width as percentage of max importance
            const widthPercent = (feature.importance / maxImportance) * 100;
            
            featureItem.innerHTML = `
                <div class="small">${feature.feature}</div>
                <div class="feature-bar" style="width: ${widthPercent}%;"></div>
                <div class="small text-end">${feature.importance.toFixed(4)}</div>
            `;
            
            featureElement.appendChild(featureItem);
        });
    }
    
    async function analyzeTrends() {
        try {
            console.log('Analyzing crime trends...');
            showLoading();
            
            // Fetch trend data with a proper timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds timeout
            
            try {
                const response = await fetch('/api/crime-trends', {
                    signal: controller.signal
                });
                
                if (!response.ok) {
                    throw new Error(`Failed to fetch crime trends: ${response.status} ${response.statusText}`);
                }
                
                // Get the text response first
                const textResponse = await response.text();
                let trendData;
                
                try {
                    // Custom JSON parsing to handle Infinity values
                    // First replace Infinity with a placeholder
                    const sanitizedText = textResponse
                        .replace(/:\s*Infinity/g, ':"__INFINITY__"')
                        .replace(/:\s*-Infinity/g, ':"__NEGATIVE_INFINITY__"');
                    
                    // Parse the sanitized JSON
                    trendData = JSON.parse(sanitizedText);
                    
                    // Replace placeholders with actual JavaScript values
                    if (trendData.increasing_crimes) {
                        trendData.increasing_crimes.forEach(crime => {
                            if (crime.avg_monthly_change === "__INFINITY__") {
                                crime.avg_monthly_change = 999; // Use a large number instead of Infinity
                            } else if (crime.avg_monthly_change === "__NEGATIVE_INFINITY__") {
                                crime.avg_monthly_change = -999;
                            }
                        });
                    }
                    
                    if (trendData.decreasing_crimes) {
                        trendData.decreasing_crimes.forEach(crime => {
                            if (crime.avg_monthly_change === "__INFINITY__") {
                                crime.avg_monthly_change = 999;
                            } else if (crime.avg_monthly_change === "__NEGATIVE_INFINITY__") {
                                crime.avg_monthly_change = -999;
                            }
                        });
                    }
                } catch (jsonError) {
                    console.error('Invalid JSON response:', textResponse);
                    console.error('JSON parse error:', jsonError);
                    
                    // Try a more aggressive approach - manually handle Infinity
                    try {
                        // First try a direct replacement approach
                        const fixedText = textResponse.replace(/: Infinity/g, ': 999').replace(/: -Infinity/g, ': -999');
                        trendData = JSON.parse(fixedText);
                    } catch (error) {
                        console.error('Second parsing attempt failed:', error);
                        throw new Error('Server returned invalid JSON');
                    }
                }
                
                console.log('Received trend data:', trendData);
                
                // Check if there's an error message in the response
                if (trendData.error) {
                    console.warn('Server reported trend analysis error:', trendData.error);
                    // Still update UI with empty data
                    updateTrendInfo(trendData);
                    // Show alert with error
                    alert(`Note: ${trendData.error}`);
                } else {
                    // Update UI with the data
                    updateTrendInfo(trendData);
                }
                
                // Clear timeout
                clearTimeout(timeoutId);
            } catch (fetchError) {
                console.error('Error fetching trend data:', fetchError);
                
                if (fetchError.name === 'AbortError') {
                    alert('Request timed out. Please try again.');
                } else {
                    alert('Failed to analyze crime trends: ' + fetchError.message);
                }
                
                // Update UI with empty data
                updateTrendInfo({
                    increasing_crimes: [],
                    decreasing_crimes: []
                });
                
                // Clear timeout
                clearTimeout(timeoutId);
            }
            
            hideLoading();
        } catch (error) {
            console.error('Error analyzing trends:', error);
            hideLoading();
            alert('Failed to analyze crime trends. Please try again later.');
            
            // Update UI with empty data
            updateTrendInfo({
                increasing_crimes: [],
                decreasing_crimes: []
            });
        }
    }
    
    function updateTrendInfo(trendData) {
        // Safety checks
        if (!trendData) {
            trendData = { increasing_crimes: [], decreasing_crimes: [] };
        }
        
        if (!trendData.increasing_crimes) {
            trendData.increasing_crimes = [];
        }
        
        if (!trendData.decreasing_crimes) {
            trendData.decreasing_crimes = [];
        }

        // Update increasing crimes
        const increasingElement = document.getElementById('increasing-crimes');
        increasingElement.innerHTML = '';
        
        if (trendData.increasing_crimes.length === 0) {
            increasingElement.innerHTML = '<div class="alert alert-info">No increasing crime trends found.</div>';
        } else {
            // Sort by highest percentage change first
            const sortedIncreasing = [...trendData.increasing_crimes]
                .sort((a, b) => (b.avg_monthly_change || 0) - (a.avg_monthly_change || 0));
            
            sortedIncreasing.forEach(crime => {
                try {
                    // Validate crime object
                    if (!crime || typeof crime !== 'object') return;
                    
                    // Ensure values are valid
                    const crimeType = crime.crime_type || 'Unknown';
                    let avgChange = 0;
                    
                    if (typeof crime.avg_monthly_change === 'number' && !isNaN(crime.avg_monthly_change)) {
                        avgChange = crime.avg_monthly_change;
                    }
                    
                    // Skip if change is too small (less than 0.1%)
                    if (Math.abs(avgChange) < 0.1) return;
                    
                    const trendItem = document.createElement('div');
                    trendItem.className = 'trend-item';
                    
                    // Format the percentage with proper sign and color
                    const formattedChange = avgChange > 0 
                        ? `<div class="trend-value trend-positive">+${avgChange.toFixed(1)}%</div>`
                        : `<div class="trend-value">0.0%</div>`;
                    
                    trendItem.innerHTML = `
                        <div>${crimeType}</div>
                        ${formattedChange}
                    `;
                    increasingElement.appendChild(trendItem);
                } catch (error) {
                    console.error('Error rendering increasing crime trend:', error);
                }
            });
            
            // If no items were added (all were filtered out), show message
            if (increasingElement.children.length === 0) {
                increasingElement.innerHTML = '<div class="alert alert-info">No significant increasing crime trends found.</div>';
            }
        }
        
        // Update decreasing crimes
        const decreasingElement = document.getElementById('decreasing-crimes');
        decreasingElement.innerHTML = '';
        
        if (trendData.decreasing_crimes.length === 0) {
            decreasingElement.innerHTML = '<div class="alert alert-info">No decreasing crime trends found.</div>';
        } else {
            // Sort by lowest percentage change first (most negative)
            const sortedDecreasing = [...trendData.decreasing_crimes]
                .sort((a, b) => (a.avg_monthly_change || 0) - (b.avg_monthly_change || 0));
            
            sortedDecreasing.forEach(crime => {
                try {
                    // Validate crime object
                    if (!crime || typeof crime !== 'object') return;
                    
                    // Ensure values are valid
                    const crimeType = crime.crime_type || 'Unknown';
                    let avgChange = 0;
                    
                    if (typeof crime.avg_monthly_change === 'number' && !isNaN(crime.avg_monthly_change)) {
                        avgChange = crime.avg_monthly_change;
                    }
                    
                    // Skip if change is too small (less than 0.1%)
                    if (Math.abs(avgChange) < 0.1) return;
                    
                    const trendItem = document.createElement('div');
                    trendItem.className = 'trend-item';
                    
                    // Format the percentage with proper color
                    const formattedChange = avgChange < 0
                        ? `<div class="trend-value trend-negative">${avgChange.toFixed(1)}%</div>`
                        : `<div class="trend-value">0.0%</div>`;
                    
                    trendItem.innerHTML = `
                        <div>${crimeType}</div>
                        ${formattedChange}
                    `;
                    decreasingElement.appendChild(trendItem);
                } catch (error) {
                    console.error('Error rendering decreasing crime trend:', error);
                }
            });
            
            // If no items were added (all were filtered out), show message
            if (decreasingElement.children.length === 0) {
                decreasingElement.innerHTML = '<div class="alert alert-info">No significant decreasing crime trends found.</div>';
            }
        }
    }
});