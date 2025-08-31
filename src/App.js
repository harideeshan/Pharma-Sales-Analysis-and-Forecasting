import React, { useState, useEffect, useRef } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { BarChart, Droplets, TrendingUp, Download, Loader2, Search, LineChart, PieChart, Send, Sparkles } from 'lucide-react';
import './App.css';

// Helper function to parse CSV text into an array of objects
const parseCSV = (csvText) => {
  if (!csvText || typeof csvText !== 'string') return [];
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',');
    return headers.reduce((obj, header, index) => {
      obj[header] = values[index] ? values[index].trim() : '';
      return obj;
    }, {});
  });
};

// Helper function to dynamically load the JSZip library
const loadJSZip = () => {
  return new Promise((resolve, reject) => {
    if (window.JSZip) return resolve();
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load JSZip library.'));
    document.head.appendChild(script);
  });
};

// Helper function to format dates for display text
const formatDateForDisplay = (dateString) => {
  if (!dateString) return '';
  const date = new Date(`${dateString}T00:00:00Z`);
  // --- CORRECTED FUNCTION NAME ---
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
};

// Helper function to format Date objects for the API (YYYY-MM-DD)
const formatDateForAPI = (date) => {
  if (!date) return null;
  return date.toISOString().split('T')[0];
};

// Main App component
export default function App() {
  const API_BASE_URL = "https://harideeshab-pharma-sales-api.hf.space";
  
  const chatContainerRef = useRef(null);

  // State management
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [availableDates, setAvailableDates] = useState({ min: null, max: null });

  const [summaryFromDate, setSummaryFromDate] = useState(null);
  const [summaryToDate, setSummaryToDate] = useState(null);
  const [forecastFromDate, setForecastFromDate] = useState(null);
  const [forecastToDate, setForecastToDate] = useState(null);

  // UI state
  const [analysisData, setAnalysisData] = useState(null);
  const [historicalSummaryText, setHistoricalSummaryText] = useState('');
  const [forecastSummaryText, setForecastSummaryText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [zipBlob, setZipBlob] = useState(null);
  const [activeTab, setActiveTab] = useState('historical');
  
  // --- MODIFIED STATE FOR AI INTEGRATION ---
  const [userQuestion, setUserQuestion] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [isAiChatLoading, setIsAiChatLoading] = useState(false);
  // NEW state to hold the forecast data for the AI
  const [forecastDataCsvText, setForecastDataCsvText] = useState('');


  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setError('');
        const productsResponse = await fetch(`${API_BASE_URL}/products/`);
        if (!productsResponse.ok) throw new Error('Failed to fetch product list.');
        const productData = await productsResponse.json();
        setProducts(productData);
        if (productData.length > 0) setSelectedProduct(productData[0]);

        const datesResponse = await fetch(`${API_BASE_URL}/available-dates/`);
        if (!datesResponse.ok) throw new Error('Failed to fetch available dates.');
        const datesData = await datesResponse.json();
        setAvailableDates({
          min: new Date(`${datesData.min_available_date}T00:00:00Z`),
          max: new Date(`${datesData.max_available_date}T00:00:00Z`)
        });
      } catch (err) {
        console.error(err);
        setError(err.message);
      }
    };
    fetchInitialData();
  }, [API_BASE_URL]);

  // Scroll to the bottom of the chat window when new messages are added
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const handleGenerateForecast = async () => {
    if (!selectedProduct) {
      setError('Please select a product.');
      return;
    }
    setIsLoading(true);
    setError('');
    setAnalysisData(null);
    setHistoricalSummaryText('');
    setForecastSummaryText('');
    // Reset AI state on new report generation
    setChatHistory([]);
    setForecastDataCsvText(''); // Reset AI context
    setZipBlob(null);
    setActiveTab('historical');

    try {
      await loadJSZip();
      const formData = new FormData();
      formData.append('product_name', selectedProduct);

      if (summaryFromDate && summaryToDate) {
        formData.append('from_date', formatDateForAPI(summaryFromDate));
        formData.append('to_date', formatDateForAPI(summaryToDate));
      }
      if (forecastFromDate && forecastToDate) {
        formData.append('forecast_from_date', formatDateForAPI(forecastFromDate));
        formData.append('forecast_to_date', formatDateForAPI(forecastToDate));
      }

      const response = await fetch(`${API_BASE_URL}/forecast/`, { method: 'POST', body: formData });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API Error: ${errorData.detail || response.statusText}`);
      }

      const blob = await response.blob();
      setZipBlob(blob);
      const zip = await window.JSZip.loadAsync(blob);
      const data = {};

      // --- MODIFIED: File processing logic ---
      const filePromises = Object.keys(zip.files).map(async (filename) => {
        const file = zip.files[filename];
        if (filename.endsWith('.png')) {
          const imageBlob = await file.async('blob');
          data[filename.replace('.png', '')] = URL.createObjectURL(imageBlob);
        } else if (filename.includes('forecast_custom_date')) {
          const csvText = await file.async('text');
          data.custom_forecast_data = parseCSV(csvText);
          data.custom_forecast_csv_text = csvText;
        } else if (filename.includes('detailed_summary_report.txt')) {
          const textContent = await file.async('text');
          setHistoricalSummaryText(textContent);
        } else if (filename.includes('forecast_summary_report.txt')) {
          const textContent = await file.async('text');
          setForecastSummaryText(textContent);
        } else if (filename.includes('full_forecast_data.csv')) {
          // NEW: Capture the full forecast data for the AI chatbot
          const csvText = await file.async('text');
          setForecastDataCsvText(csvText);
        }
      });
      await Promise.all(filePromises);
      setAnalysisData(data);
    } catch (err) {
      console.error(err);
      setError(`Failed to generate forecast. ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  // --- MODIFIED: AI Chat Handler ---
  const handleAskAI = async (e) => {
    e.preventDefault();
    if (!userQuestion.trim()) return;

    // Check if AI context is ready
    if (!forecastDataCsvText) {
        setError("The AI context is not ready yet. Please wait a moment after generating the report and try again.");
        return;
    }

    setIsAiChatLoading(true);
    setError('');

    const newUserQuestion = userQuestion;
    setChatHistory(prev => [...prev, { sender: 'user', text: newUserQuestion }]);
    setUserQuestion('');

    try {
      const formData = new FormData();
      formData.append('user_prompt', newUserQuestion);
      formData.append('historical_summary', historicalSummaryText);
      formData.append('forecast_summary', forecastSummaryText);
      // NEW: Send the detailed forecast data to the backend
      formData.append('forecast_data_csv', forecastDataCsvText);

      const response = await fetch(`${API_BASE_URL}/ask-ai/`, {
        method: 'POST',
        body: formData
      });

      // --- IMPROVED: Error Handling ---
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'The server returned an invalid error format.' }));
        const errorMessage = typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail);
        throw new Error(`AI API Error: ${errorMessage}`);
      }
      
      const result = await response.json();
      setChatHistory(prev => [...prev, { sender: 'gemini', text: result.gemini_answer }]);

    } catch (err) {
      console.error(err);
      // Display the detailed error in the chat
      setChatHistory(prev => [...prev, { sender: 'gemini', text: `Sorry, I'm unable to answer that right now. ${err.message}` }]);
    } finally {
      setIsAiChatLoading(false);
    }
  };

  const renderTextSummary = (text) => {
    if (!text) return null;
    return text.split('\n').map((line, index) => {
      const parts = line.split(/(\*\*.*?\*\*)/g).map((part, partIndex) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <b key={partIndex}>{part.slice(2, -2)}</b>;
        }
        return part;
      });
      return <p key={index}>{parts}</p>;
    });
  };

  const getImagePath = (path) => {
    return path.replace('.png', '');
  };

  return (
    <div className="app">
      <header className="hero">
        <Droplets className="hero-icon" />
        <h1>Pharma Sales Forecaster</h1>
        <p>Select a product to generate a comprehensive sales analysis and a long-term forecast until 2028.</p>
        <div className="controls">
          <div className="select-container">
            <Search className="search-icon" />
            <select
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
              disabled={products.length === 0}
            >
              {products.length > 0 ? products.map(p => <option key={p} value={p}>{p}</option>) : <option>Loading products...</option>}
            </select>
          </div>
          <div className="date-controls">
            <div className="date-range-group">
              <label className="group-label">Historical Sales Summary (Optional)</label>
              <div className="date-inputs">
                <DatePicker
                  selected={summaryFromDate}
                  onChange={(date) => setSummaryFromDate(date)}
                  selectsStart
                  startDate={summaryFromDate}
                  endDate={summaryToDate}
                  minDate={availableDates.min}
                  maxDate={availableDates.max}
                  placeholderText="From"
                  dateFormat="yyyy/MMM/dd"
                  className="date-picker-input"
                  showYearDropdown
                  dropdownMode="select"
                  isClearable
                />
                <DatePicker
                  selected={summaryToDate}
                  onChange={(date) => setSummaryToDate(date)}
                  selectsEnd
                  startDate={summaryFromDate}
                  endDate={summaryToDate}
                  minDate={summaryFromDate || availableDates.min}
                  maxDate={availableDates.max}
                  placeholderText="To"
                  dateFormat="yyyy/MMM/dd"
                  className="date-picker-input"
                  showYearDropdown
                  dropdownMode="select"
                  isClearable
                />
              </div>
              {availableDates.min && <small>Data available from {formatDateForDisplay(availableDates.min.toISOString().split('T')[0])} to {formatDateForDisplay(availableDates.max.toISOString().split('T')[0])}</small>}
            </div>
            <div className="date-range-group">
              <label className="group-label">Custom Date Forecast (Optional)</label>
              <div className="date-inputs">
                <DatePicker
                  selected={forecastFromDate}
                  onChange={(date) => setForecastFromDate(date)}
                  selectsStart
                  startDate={forecastFromDate}
                  endDate={forecastToDate}
                  placeholderText="From"
                  dateFormat="yyyy/MMM/dd"
                  className="date-picker-input"
                  showYearDropdown
                  dropdownMode="select"
                  isClearable
                />
                <DatePicker
                  selected={forecastToDate}
                  onChange={(date) => setForecastToDate(date)}
                  selectsEnd
                  startDate={forecastFromDate}
                  endDate={forecastToDate}
                  minDate={forecastFromDate}
                  placeholderText="To"
                  dateFormat="yyyy/MMM/dd"
                  className="date-picker-input"
                  showYearDropdown
                  dropdownMode="select"
                  isClearable
                />
              </div>
              <small>Select any future date range</small>
            </div>
          </div>
          <button className="generate-button" onClick={handleGenerateForecast} disabled={isLoading || !selectedProduct}>
            {isLoading ? <><Loader2 className="loader" /> Generating...</> : <><TrendingUp /> Generate Report</>}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </header>

      {analysisData && (
        <main className="dashboard">
          <div className="dashboard-header">
            <h2>Analysis Report for <span>{selectedProduct}</span></h2>
            <button onClick={() => handleDownload(zipBlob, `analysis_report_${selectedProduct}.zip`)} disabled={!zipBlob}>
              <Download /> Download Full Report (.zip)
            </button>
          </div>

          <div className="tabs">
            <button
              className={`tab-button ${activeTab === 'historical' ? 'active' : ''}`}
              onClick={() => setActiveTab('historical')}
            >
              <BarChart size={16} /> Historical Analysis
            </button>
            <button
              className={`tab-button ${activeTab === 'forecast' ? 'active' : ''}`}
              onClick={() => setActiveTab('forecast')}
            >
              <LineChart size={16} /> Forecast & Predictions
            </button>
          </div>

          <div className="tab-content">
            {activeTab === 'historical' && (
              <div className="grid">
                {/* (Historical analysis cards remain the same) */}
                {selectedProduct === 'ALL' && analysisData[getImagePath('1_overall_sales_summary.png')] && (
                  <div className="card">
                    <h3><BarChart /> Overall Historical Sales</h3>
                    <img src={analysisData[getImagePath('1_overall_sales_summary.png')]} alt="Overall Historical Sales by Product" />
                  </div>
                )}
                {selectedProduct === 'ALL' && analysisData[getImagePath('2_date_range_summary_ALL.png')] && (
                  <div className="card">
                    <h3><BarChart /> Sales in Specified Date Range</h3>
                    <p className="card-subtitle">{formatDateForAPI(summaryFromDate)} to {formatDateForAPI(summaryToDate)}</p>
                    <img src={analysisData[getImagePath('2_date_range_summary_ALL.png')]} alt="Sales in Specified Date Range" />
                  </div>
                )}
                {selectedProduct !== 'ALL' && analysisData[getImagePath(`product_analysis_${selectedProduct}/date_range_summary_${selectedProduct}.png`)] && (
                  <div className="card">
                    <h3><BarChart /> Sales in Specified Date Range</h3>
                    <p className="card-subtitle">{formatDateForAPI(summaryFromDate)} to {formatDateForAPI(summaryToDate)}</p>
                    <img src={analysisData[getImagePath(`product_analysis_${selectedProduct}/date_range_summary_${selectedProduct}.png`)]} alt="Sales in Specified Date Range" />
                  </div>
                )}
                {analysisData[getImagePath(`product_analysis_${selectedProduct}/sales_by_day_of_week.png`)] && (
                  <div className="card">
                    <h3><BarChart /> Sales by Day of Week</h3>
                    <img src={analysisData[getImagePath(`product_analysis_${selectedProduct}/sales_by_day_of_week.png`)]} alt="Sales by Day of Week" />
                  </div>
                )}
                {analysisData[getImagePath(`product_analysis_${selectedProduct}/sales_by_month.png`)] && (
                  <div className="card">
                    <h3><BarChart /> Sales by Month</h3>
                    <img src={analysisData[getImagePath(`product_analysis_${selectedProduct}/sales_by_month.png`)]} alt="Sales by Month" />
                  </div>
                )}
                {selectedProduct !== 'ALL' && analysisData[getImagePath(`product_analysis_${selectedProduct}/long_term_trend.png`)] && (
                  <div className="card">
                    <h3><TrendingUp /> Long-Term Sales Trend</h3>
                    <img src={analysisData[getImagePath(`product_analysis_${selectedProduct}/long_term_trend.png`)]} alt="Long-Term Sales Trend" />
                  </div>
                )}
                {historicalSummaryText && (
                  <div className="card text-card full-width">
                    <h3><BarChart /> Historical Analysis Summary</h3>
                    <div className="summary-content">
                      {renderTextSummary(historicalSummaryText)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'forecast' && (
              <div className="grid">
                {analysisData[getImagePath(`forecast_chart_${selectedProduct}.png`)] && (
                  <div className="card full-width">
                    {/* --- MODIFIED: Chart title --- */}
                    <h3><TrendingUp /> Long-Term Forecast (until 2028)</h3>
                    <img src={analysisData[getImagePath(`forecast_chart_${selectedProduct}.png`)]} alt="Long-Term Forecast" />
                  </div>
                )}
                {analysisData[getImagePath(`forecast_components_${selectedProduct}.png`)] && (
                  <div className="card">
                    <h3><PieChart /> Forecast Components</h3>
                    <img src={analysisData[getImagePath(`forecast_components_${selectedProduct}.png`)]} alt="Forecast Components" />
                  </div>
                )}
                {analysisData[getImagePath(`forecast_trend_changes_${selectedProduct}.png`)] && (
                  <div className="card">
                    <h3><LineChart /> Forecast Trend Changepoints</h3>
                    <img src={analysisData[getImagePath(`forecast_trend_changes_${selectedProduct}.png`)]} alt="Forecast Trend Changepoints" />
                  </div>
                )}
                
                {/* --- REMOVED: Old 12-month forecast table --- */}

                {analysisData.custom_forecast_data && (
                  <div className="card table-card full-width">
                    <div className="card-header">
                      <h3>Custom Date Range Forecast</h3>
                      <button onClick={() => handleDownload(new Blob([analysisData.custom_forecast_csv_text], { type: 'text/csv;charset=utf-8;' }), `custom_forecast_${selectedProduct}.csv`)}>
                        <Download /> Download CSV
                      </button>
                    </div>
                    <p className="card-subtitle">{formatDateForAPI(forecastFromDate)} to {formatDateForAPI(forecastToDate)}</p>
                    <div className="table-wrapper">
                      <table>
                        <thead>
                          <tr>
                            {analysisData.custom_forecast_data.length > 0 && Object.keys(analysisData.custom_forecast_data[0]).map(key => (
                              <th key={key}>{key}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {analysisData.custom_forecast_data.map((row, i) => (
                            <tr key={i}>
                              {Object.values(row).map((val, j) => (
                                <td key={j}>{typeof val === 'string' && val.includes('-') ? val.split(' ')[0] : val}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {forecastSummaryText && (
                  <div className="card text-card full-width">
                    <h3><TrendingUp /> Forecast Summary</h3>
                    <div className="summary-content">
                      {renderTextSummary(forecastSummaryText)}
                    </div>
                  </div>
                )}
                
                {/* --- REMOVED: AI Summary Button and Display Card --- */}

                {/* --- AI Chat Feature --- */}
                {historicalSummaryText && forecastSummaryText && (
                  <div className="card chat-card full-width">
                    <h3><Sparkles /> Ask the AI Assistant</h3>
                    <div className="chat-container" ref={chatContainerRef}>
                      {chatHistory.length === 0 ? (
                        <div className="chat-message-initial">
                          Ask me anything about the reports! <br/>
                          E.g., "What will sales look like in 2027?"
                        </div>
                      ) : (
                        chatHistory.map((msg, index) => (
                          <div key={index} className={`chat-message ${msg.sender}`}>
                            {renderTextSummary(msg.text)}
                          </div>
                        ))
                      )}
                      {isAiChatLoading && (
                        <div className="chat-message gemini loading">
                          <Loader2 className="loader" />
                        </div>
                      )}
                    </div>
                    <form className="chat-input-form" onSubmit={handleAskAI}>
                      <input
                        type="text"
                        value={userQuestion}
                        onChange={(e) => setUserQuestion(e.target.value)}
                        placeholder="Ask a question about the reports..."
                        disabled={isAiChatLoading}
                      />
                      <button type="submit" disabled={isAiChatLoading || !userQuestion.trim()}>
                        <Send />
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      )}
    </div>
  );
}
