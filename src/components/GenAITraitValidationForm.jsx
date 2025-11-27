import React, { useState, useEffect } from 'react';
import './GenAITraitValidationForm.css';

const GenAITraitValidationForm = () => {
  const getInitialFormState = () => ({
    version: 'basic',
    text: '',
    project_input: '',
    concept_input: ''
  });

  const [formData, setFormData] = useState(getInitialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiResponse, setApiResponse] = useState(null);
  const [tableData, setTableData] = useState([]);
  const [isLoadingTable, setIsLoadingTable] = useState(false);
  const [tableError, setTableError] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevState => ({
      ...prevState,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setApiResponse(null);
    
    // Prepare the data to send to the API
    const apiData = {
      text: formData.text.trim(),
    version:formData.version

    };

    // If type is context, include project and concept input
    if (formData.version === 'context') {
      apiData.project_input = formData.project_input.trim();
      apiData.concept_input = formData.concept_input.trim();
    }

    console.log('Submitting form', apiData);
    try {
      const response = await fetch('http://localhost:8000/batch_classify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body:JSON.stringify(apiData)
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
  };

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

          <div className="form-group">
            <label htmlFor="reactionText">
              Reaction Text<span className="required">*</span>
            </label>
            <input
              type="text"
              id="reactionText"
              name="text"
              value={formData.text}
              onChange={handleChange}
              placeholder="Enter your reaction text here..."
              required
            />
          </div>

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
