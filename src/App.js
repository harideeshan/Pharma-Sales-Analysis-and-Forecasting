import React, { useState, useEffect, useRef } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { BarChart, Droplets, TrendingUp, Download, Loader2, Search, LineChart, PieChart, Send, Sparkles } from 'lucide-react';
import './App.css';

// Helper functions (parseCSV, loadJSZip, formatDateForDisplay, formatDateForAPI) remain the same...
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

const formatDateForDisplay = (dateString) => {
    if (!dateString) return '';
    const date = new Date(`${dateString}T00:00:00Z`);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
};

const formatDateForAPI = (date) => {
    if (!date) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

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

    // AI Integration state
    const [userQuestion, setUserQuestion] = useState('');
    const [chatHistory, setChatHistory] = useState([]);
    const [isAiChatLoading, setIsAiChatLoading] = useState(false);
    const [forecastDataCsvText, setForecastDataCsvText] = useState('');
    const [historicalDataCsvText, setHistoricalDataCsvText] = useState('');

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
        setChatHistory([]);
        setForecastDataCsvText('');
        setHistoricalDataCsvText('');
        setZipBlob(null);

        try {
            await loadJSZip();
            const formData = new FormData();
            formData.append('product_name', selectedProduct);

            if (summaryFromDate) {
                formData.append('from_date', formatDateForAPI(summaryFromDate));
            }
            if (summaryToDate) {
                formData.append('to_date', formatDateForAPI(summaryToDate));
            }
            if (forecastFromDate) {
                formData.append('forecast_from_date', formatDateForAPI(forecastFromDate));
            }
            if (forecastToDate) {
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
                    const csvText = await file.async('text');
                    setForecastDataCsvText(csvText);
                } else if (filename.includes('historical_data.csv')) {
                    const csvText = await file.async('text');
                    setHistoricalDataCsvText(csvText);
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

    const handleAskAI = async (e) => {
        e.preventDefault();
        if (!userQuestion.trim()) return;

        if (!forecastDataCsvText || !historicalDataCsvText) {
            setError("The AI context is not ready yet. Please wait a moment and try again.");
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
            formData.append('forecast_data_csv', forecastDataCsvText);
            formData.append('historical_data_csv', historicalDataCsvText);

            const response = await fetch(`${API_BASE_URL}/ask-ai/`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: 'The server returned an invalid error format.' }));
                const errorMessage = typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail);
                throw new Error(`AI API Error: ${errorMessage}`);
            }

            const result = await response.json();
            setChatHistory(prev => [...prev, { sender: 'gemini', text: result.gemini_answer }]);

        } catch (err) {
            console.error(err);
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

    const forecastEndDateText = forecastToDate
        ? `until ${formatDateForDisplay(formatDateForAPI(forecastToDate))}`
        : "for the next 2 years";


    return (
        <div className="app-container">
            {!analysisData ? (
                // Input Page
                <main className="input-page">
                    <header className="page-header">
                        <Droplets className="header-icon" />
                        <h1>Pharma Sales Forecaster</h1>
                        <p>Generate a comprehensive analysis and forecast for any product.</p>
                    </header>
                    <div className="card input-card">
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
                                    <label className="group-label">Historical Sales (Optional)</label>
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
                                    {availableDates.min && <small>Data: {formatDateForDisplay(availableDates.min.toISOString().split('T')[0])} to {formatDateForDisplay(availableDates.max.toISOString().split('T')[0])}</small>}
                                </div>
                                <div className="date-range-group">
                                    <label className="group-label">Custom Forecast (Optional)</label>
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
                    </div>
                </main>
            ) : (
                // Analysis Page
                <main className="analysis-page">
                    <header className="page-header analysis-header">
                        <div className="header-content">
                            <h1 className="report-title">Analysis Report for <span className="highlight">{selectedProduct}</span></h1>
                            <button className="download-button" onClick={() => handleDownload(zipBlob, `analysis_report_${selectedProduct}.zip`)} disabled={!zipBlob}>
                                <Download /> Download Full Report
                            </button>
                        </div>
                    </header>

                    <div className="dashboard-content">
                        <div className="analysis-column">
                            <div className="analysis-section">
                                <h2 className="section-title"><BarChart /> Historical Sales Analysis</h2>
                                <p className="section-subtitle">A detailed look at past sales performance and trends.</p>
                                <div className="historical-grid">
                                    {analysisData[getImagePath(`product_analysis_${selectedProduct}/long_term_trend.png`)] && <div className="card full-width"><h3><TrendingUp /> Historical Long-Term Trend</h3><img src={analysisData[getImagePath(`product_analysis_${selectedProduct}/long_term_trend.png`)]} alt="Historical Long-Term Trend" /></div>}
                                    {selectedProduct === 'ALL' && analysisData[getImagePath('1_overall_sales_summary.png')] && <div className="card full-width"><h3><BarChart /> Overall Historical Sales</h3><img src={analysisData[getImagePath('1_overall_sales_summary.png')]} alt="Overall Historical Sales by Product" /></div>}
                                    {analysisData[getImagePath(`product_analysis_${selectedProduct}/sales_by_day_of_week.png`)] && <div className="card"><h3><BarChart /> Sales by Day of Week</h3><img src={analysisData[getImagePath(`product_analysis_${selectedProduct}/sales_by_day_of_week.png`)]} alt="Sales by Day of Week" /></div>}
                                    {analysisData[getImagePath(`product_analysis_${selectedProduct}/sales_by_month.png`)] && <div className="card"><h3><BarChart /> Sales by Month</h3><img src={analysisData[getImagePath(`product_analysis_${selectedProduct}/sales_by_month.png`)]} alt="Sales by Month" /></div>}
                                    {historicalSummaryText && <div className="card text-card full-width"><h3><BarChart /> Historical Summary</h3><div className="summary-content">{renderTextSummary(historicalSummaryText)}</div></div>}
                                </div>
                            </div>
                            <div className="analysis-section">
                                <h2 className="section-title"><TrendingUp /> Forecast & Predictions</h2>
                                <p className="section-subtitle">Forecasted sales volume and key trend components.</p>
                                <div className="forecast-grid">
                                    {analysisData[getImagePath(`forecast_chart_${selectedProduct}.png`)] && <div className="card full-width">
                                        <h3><TrendingUp /> Long-Term Forecast</h3>
                                        <p className="graph-subtitle">Note: Y-axis represents Monthly Sales Volume.</p>
                                        <img src={analysisData[getImagePath(`forecast_chart_${selectedProduct}.png`)]} alt="Long-Term Forecast" />
                                    </div>}
                                    {analysisData[getImagePath(`forecast_components_${selectedProduct}.png`)] && <div className="card"><h3><PieChart /> Forecast Components</h3><img src={analysisData[getImagePath(`forecast_components_${selectedProduct}.png`)]} alt="Forecast Components" /></div>}
                                    {analysisData[getImagePath(`forecast_trend_changes_${selectedProduct}.png`)] && <div className="card"><h3><LineChart /> Forecast Trend Changepoints</h3><img src={analysisData[getImagePath(`forecast_trend_changes_${selectedProduct}.png`)]} alt="Forecast Trend Changepoints" /></div>}
                                    {analysisData.custom_forecast_data && <div className="card table-card full-width"><div className="card-header"><h3>Custom Date Range Forecast</h3><button onClick={() => handleDownload(new Blob([analysisData.custom_forecast_csv_text], { type: 'text/csv;charset=utf-8;' }), `custom_forecast_${selectedProduct}.csv`)}><Download /> Download CSV</button></div><p className="card-subtitle">{formatDateForAPI(forecastFromDate)} to {formatDateForAPI(forecastToDate)}</p><div className="table-wrapper"><table><thead><tr>{analysisData.custom_forecast_data.length > 0 && Object.keys(analysisData.custom_forecast_data[0]).map(key => (<th key={key}>{key}</th>))}</tr></thead><tbody>{analysisData.custom_forecast_data.map((row, i) => (<tr key={i}>{Object.values(row).map((val, j) => (<td key={j}>{typeof val === 'string' && val.includes('-') ? val.split(' ')[0] : val}</td>))}</tr>))}</tbody></table></div></div>}
                                    {forecastSummaryText && <div className="card text-card full-width"><h3><TrendingUp /> Forecast Summary</h3><div className="summary-content">{renderTextSummary(forecastSummaryText)}</div></div>}
                                </div>
                            </div>
                        </div>
                        <div className="ai-column">
                            {historicalSummaryText && forecastSummaryText && (
                                <div className="card chat-card">
                                    <h3><Sparkles /> Ask the AI Assistant</h3>
                                    <div className="chat-container" ref={chatContainerRef}>
                                        {chatHistory.length === 0 ? (
                                            <div className="chat-message-initial">
                                                <p><strong>I can answer questions about:</strong></p>
                                                <ul>
                                                    <li>Historical sales from 2014 to 2019.</li>
                                                    <li>Sales forecasts {forecastEndDateText}.</li>
                                                </ul>
                                                <p><strong>For example, try asking:</strong></p>
                                                <ul>
                                                    <li><em>"What was the top product in 2017?"</em></li>
                                                    <li><em>"Compare N02BE and M01AE in 2026."</em></li>
                                                </ul>
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
                                            placeholder="Ask a question..."
                                            disabled={isAiChatLoading}
                                        />
                                        <button type="submit" disabled={isAiChatLoading || !userQuestion.trim()}>
                                            <Send />
                                        </button>
                                    </form>
                                </div>
                            )}
                        </div>
                    </div>
                </main>
            )}
        </div>
    );
}
