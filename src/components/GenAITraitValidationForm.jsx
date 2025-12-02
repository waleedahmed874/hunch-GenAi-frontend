import React, { useState, useEffect } from 'react';
import './GenAITraitValidationForm.css';

const GenAITraitValidationForm = () => {
  const getInitialFormState = () => ({
    version: 'basic',
    project_input: '',
    concept_input: ''
  });

  const [formData, setFormData] = useState(getInitialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiResponse, setApiResponse] = useState(null);
  const [tableData, setTableData] = useState([]);
  const [isLoadingTable, setIsLoadingTable] = useState(false);
  const [tableError, setTableError] = useState(null);
  
  // CSV upload states
  const [csvFile, setCsvFile] = useState(null);
  const [csvData, setCsvData] = useState([]);
  const [csvColumns, setCsvColumns] = useState([]);
  const [csvPreview, setCsvPreview] = useState([]);
  const [useCsv, setUseCsv] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevState => ({
      ...prevState,
      [name]: value
    }));
  };

  // CSV file handler
  const handleCsvUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setCsvFile(file);
    const reader = new FileReader();
    
    reader.onload = (event) => {
      const text = event.target.result;
      parseCsv(text);
    };
    
    reader.readAsText(file);
  };

  // Parse CSV to JSON
  const parseCsv = (csvText) => {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length === 0) return;

    // Get headers
    const headers = lines[0].split(',').map(h => h.trim());
    setCsvColumns(headers);

    // Validate required columns
    const requiredColumns = ['context_prompt', 'initial_reaction', 'uuid'];
    const missingColumns = requiredColumns.filter(col => !headers.includes(col));
    
    if (missingColumns.length > 0) {
      alert(`Missing required columns: ${missingColumns.join(', ')}`);
      setCsvFile(null);
      setCsvData([]);
      setCsvPreview([]);
      return;
    }

    // Parse data rows
    const parsedData = [];
    const previewData = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      if (values.length !== headers.length) continue;

      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index];
      });

      parsedData.push(row);
      
      // Store first 5 rows for preview
      if (i <= 5) {
        previewData.push(row);
      }
    }

    setCsvData(parsedData);
    setCsvPreview(previewData);
    setUseCsv(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setApiResponse(null);
    
    let apiData;

    // If CSV is selected, send CSV data as JSON array
    if (useCsv && csvData.length > 0) {
      apiData = {
        version: formData.version,
        csv_data: csvData.map(row => ({
          context_prompt: row.context_prompt || '',
          initial_reaction: row.initial_reaction || '',
          uuid: row.uuid || ''
        }))
      };
      
      // If version is context, also include project_input and concept_input
      if (formData.version === 'context') {
        apiData.project_input = formData.project_input.trim();
        apiData.concept_input = formData.concept_input.trim();
      }
    } else {
      // Original form submission
      apiData = {
        version: formData.version
      };

      if (formData.version === 'context') {
        apiData.project_input = formData.project_input.trim();
        apiData.concept_input = formData.concept_input.trim();
      }
    }

    console.log('Submitting form', apiData);
    try {
      const response = await fetch('http://localhost:3000/api/traits/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(apiData)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('API Response:', result);
      setApiResponse(result);
    } catch (error) {
      console.error('Error submitting form:', error);
      let errorMessage = error.message;
      
      if (error.message === 'Failed to fetch') {
        errorMessage = 'Failed to connect to the API server. Please ensure:\n\n' +
          '1. The backend server is running on http://localhost:8000\n' +
          '2. The server has CORS enabled to accept requests from http://localhost:3000\n' +
          '3. The /batch_classify endpoint is accessible';
      }
      
      setApiResponse({ error: errorMessage });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setFormData(getInitialFormState());
    setApiResponse(null);
    setCsvFile(null);
    setCsvData([]);
    setCsvColumns([]);
    setCsvPreview([]);
    setUseCsv(false);
  };

  // ... existing useEffect and getTraitStatus functions remain the same ...

  useEffect(() => {
    const fetchTableData = async () => {
      setIsLoadingTable(true);
      setTableError(null);
      try {
        const response = await fetch('https://hunchgenaitest-320866101884.us-central1.run.app/api/traits/db');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        if (result.success && result.data) {
          setTableData(result.data);
        } else {
          setTableError('Failed to fetch data');
        }
      } catch (error) {
        console.error('Error fetching table data:', error);
        setTableError(error.message);
      } finally {
        setIsLoadingTable(false);
      }
    };

    fetchTableData();
  }, []);

  const getTraitStatus = (item, traitName) => {
    const genAiRecord = item.genAiRecords?.find(record => record.traitTitle === traitName);
    if (!genAiRecord) return { color: 'grey', showTooltip: false };

    const isInReview = item.reviewTags?.includes(traitName);
    const isGreen = genAiRecord.llmScore === 0 && genAiRecord.genAiSays?.score === 1;

    if (isInReview) {
      return {
        color: 'red',
        showTooltip: true,
        rationale: genAiRecord.genAiSays?.rationale || '',
        confidence: genAiRecord.genAiSays?.confidence || 0
      };
    } else if (isGreen) {
      return { color: 'green', showTooltip: false };
    } else {
      return { color: 'grey', showTooltip: false };
    }
  };

  return (
    <>
      <div className="form-container">
        <h1>GenAI Trait Validation Form</h1>
        <form onSubmit={handleSubmit} onReset={handleReset}>
          <div className="form-group">
            <label htmlFor="version">
              Select Type<span className="required">*</span>
            </label>
            <select
              id="version"
              name="version"
              value={formData.version}
              onChange={handleChange}
              required
            >
              <option value="basic">Basic</option>
              <option value="context">Context</option>
            </select>
          </div>

          {/* CSV Upload Section */}
          <div className="form-group">
            <label htmlFor="csvUpload">
              Upload CSV File (Optional)
            </label>
            <input
              type="file"
              id="csvUpload"
              accept=".csv"
              onChange={handleCsvUpload}
              style={{ marginBottom: '10px' }}
            />
            <small style={{ display: 'block', color: '#666', marginTop: '5px' }}>
              CSV must contain columns: context_prompt, initial_reaction, uuid
            </small>
          </div>

          {/* CSV Preview Table */}
          {csvPreview.length > 0 && (
            <div className="form-group">
              <label>CSV Preview (showing first 5 rows)</label>
              <div className="csv-preview-table">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f5f5f5' }}>
                      {csvColumns.map((col, idx) => (
                        <th key={idx} style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.map((row, rowIdx) => (
                      <tr key={rowIdx}>
                        {csvColumns.map((col, colIdx) => (
                          <td key={colIdx} style={{ padding: '8px', border: '1px solid #ddd' }}>
                            {row[col] || '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
                  Total rows: {csvData.length}
                </p>
              </div>
            </div>
          )}

          {/* Show context fields when version is context, regardless of CSV selection */}
          {formData.version === 'context' && (
            <>
              <div className="form-group">
                <label htmlFor="projectInput">
                  Project Input<span className="required">*</span>
                </label>
                <textarea
                  id="projectInput"
                  name="project_input"
                  value={formData.project_input}
                  onChange={handleChange}
                  placeholder="Enter project input..."
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="conceptInput">
                  Concept Input<span className="required">*</span>
                </label>
                <textarea
                  id="conceptInput"
                  name="concept_input"
                  value={formData.concept_input}
                  onChange={handleChange}
                  placeholder="Enter concept input..."
                  required
                />
              </div>
            </>
          )}

          <div className="button-group">
            <button type="submit" className="submit-btn" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Submit'}
            </button>
            <button type="reset" className="reset-btn" disabled={isSubmitting}>
              Reset
            </button>
          </div>
        </form>

        {/* ... existing apiResponse section remains the same ... */}
        {apiResponse && (
          <div className="response-container">
            <h2>Response</h2>
            {apiResponse.error ? (
              <div className="error-box">
                <p><strong>Error:</strong> {apiResponse.error}</p>
              </div>
            ) : (
              <div className="results-box">
                <div className="results-header">
                  <p><strong>Total Traits:</strong> {apiResponse.total_traits}</p>
                </div>
                <div className="traits-list">
                  {apiResponse.results && apiResponse.results.map((trait, index) => (
                    <div key={index} className="trait-card">
                      <div className="trait-header">
                        <h3>{trait.trait}</h3>
                        <span className={`badge ${trait.present ? 'present' : 'absent'}`}>
                          {trait.present ? 'Present' : 'Absent'}
                        </span>
                      </div>
                      <div className="trait-details">
                        <p><strong>Confidence:</strong> {(trait.confidence * 100).toFixed(0)}%</p>
                        <p><strong>Score:</strong> {trait.score}</p>
                        <p><strong>Rationale:</strong> {trait.rationale}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ... existing table-container section remains the same ... */}
      <div className="table-container">
        <div className="table-container-inner">
          <h2>Traits Database</h2>
          {isLoadingTable && <p className="loading-text">Loading data...</p>}
          {tableError && (
            <div className="error-box">
              <p><strong>Error:</strong> {tableError}</p>
            </div>
          )}
          {!isLoadingTable && !tableError && tableData.length > 0 && (
            <div className="table-wrapper">
              <table className="traits-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Text</th>
                    <th>Traits</th>
                  </tr>
                </thead>
                <tbody>
                  {tableData.map((item) => (
                    <tr key={item._id}>
                      <td className="type-cell">{item.type}</td>
                      <td className="text-cell">{item.text}</td>
                      <td className="traits-cell">
                        <div className="traits-list-inline">
                          {item.traits?.map((traitName, index) => {
                            const status = getTraitStatus(item, traitName);
                            return (
                              <div key={index} className="trait-indicator-wrapper">
                                <div className={`trait-circle trait-circle-${status.color}`}>
                                  {status.showTooltip && (
                                    <div className="tooltip">
                                      <div className="tooltip-content">
                                        <p><strong>Rationale:</strong> {status.rationale}</p>
                                        <p><strong>Confidence:</strong> {(status.confidence * 100).toFixed(0)}%</p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <span className="trait-name">{traitName}</span>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!isLoadingTable && !tableError && tableData.length === 0 && (
            <p className="no-data-text">No data available</p>
          )}
        </div>
      </div>
    </>
  );
};

export default GenAITraitValidationForm;