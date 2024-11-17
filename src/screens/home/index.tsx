import { ColorSwatch, Group } from '@mantine/core';
import { Button } from '@/components/ui/button';
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import Draggable from 'react-draggable';
import {SWATCHES} from '@/constants';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface GeneratedResult {
    expression: string;
    answer: string;
}

interface Response {
    expr: string;
    result: string;
    assign: boolean;
}

interface APIError {
    message: string;
    error: string;
    detail?: string;
}

interface Point {
    x: number;
    y: number;
}

export default function Home() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [color, setColor] = useState('rgb(255, 255, 255)');
    const [reset, setReset] = useState(false);
    const [dictOfVars, setDictOfVars] = useState({});
    const [result, setResult] = useState<GeneratedResult>();
    const [latexPosition, setLatexPosition] = useState({ x: 10, y: 200 });
    const [latexExpression, setLatexExpression] = useState<Array<string>>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [lastPoint, setLastPoint] = useState<Point | null>(null);

    const handleAPIError = (error: APIError) => {
        console.error('API Error:', error);
        let errorMessage = 'An unexpected error occurred';
        
        if (axios.isAxiosError(error)) {
            if (error.response) {
                const data = error.response.data as APIError;
                if (error.response.status === 500) {
                    if (error.response.data.detail?.includes('UnboundLocalError: local variable')) {
                        errorMessage = 'Unable to process the mathematical expression. Please make sure your drawing is clear and try again.';
                    } else {
                        errorMessage = 'Server error occurred. Please try again later.';
                    }
                } else {
                    errorMessage = data.message || data.error || 'An error occurred while processing your request';
                }
            } else if (error.request) {
                errorMessage = 'Unable to reach the server. Please check your internet connection.';
            }
        }
        
        toast.error('Error', {
            description: errorMessage,
            duration: 5000,
        });
    };

    const handleResize = () => {
        const canvas = canvasRef.current;
        if (canvas) {
            const parent = canvas.parentElement;
            if (parent) {
                canvas.width = parent.clientWidth;
                canvas.height = window.innerHeight - canvas.offsetTop;
                
                // Preserve drawing after resize
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.lineCap = 'round';
                    ctx.lineWidth = 3;
                    ctx.strokeStyle = color;
                }
            }
        }
    };

    useEffect(() => {
        if (latexExpression.length > 0 && window.MathJax) {
            setTimeout(() => {
                window.MathJax.Hub.Queue(["Typeset", window.MathJax.Hub]);
            }, 0);
        }
    }, [latexExpression]);

    useEffect(() => {
        if (result) {
            renderLatexToCanvas(result.expression, result.answer);
        }
    }, [result]);

    useEffect(() => {
        if (reset) {
            resetCanvas();
            setLatexExpression([]);
            setResult(undefined);
            setDictOfVars({});
            setReset(false);
        }
    }, [reset]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            canvas.style.background = 'black';
            handleResize();
        }

        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.9/MathJax.js?config=TeX-MML-AM_CHTML';
        script.async = true;
        document.head.appendChild(script);

        script.onload = () => {
            window.MathJax.Hub.Config({
                tex2jax: {inlineMath: [['$', '$'], ['\\(', '\\)']]},
            });
        };

        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            document.head.removeChild(script);
        };
    }, []);

    const getPointerPosition = (event: React.MouseEvent | React.TouchEvent | TouchEvent): Point => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };

        const rect = canvas.getBoundingClientRect();
        
        if ('touches' in event) {
            const touch = event.touches[0];
            return {
                x: touch.clientX - rect.left,
                y: touch.clientY - rect.top
            };
        } else {
            return {
                x: (event as React.MouseEvent).clientX - rect.left,
                y: (event as React.MouseEvent).clientY - rect.top
            };
        }
    };

    const renderLatexToCanvas = (expression: string, answer: string) => {
        const latex = `\\(\\LARGE{${expression} = ${answer}}\\)`;
        setLatexExpression([...latexExpression, latex]);

        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        }
    };

    const resetCanvas = () => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        }
    };

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        if (isLoading) return;
        
        const point = getPointerPosition(e);
        const canvas = canvasRef.current;
        
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.beginPath();
                ctx.moveTo(point.x, point.y);
                setIsDrawing(true);
                setLastPoint(point);
            }
        }
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing || isLoading) return;
        
        const point = getPointerPosition(e);
        const canvas = canvasRef.current;
        
        if (canvas && lastPoint) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.strokeStyle = color;
                ctx.beginPath();
                ctx.moveTo(lastPoint.x, lastPoint.y);
                ctx.lineTo(point.x, point.y);
                ctx.stroke();
                setLastPoint(point);
            }
        }
    };

    const stopDrawing = () => {
        setIsDrawing(false);
        setLastPoint(null);
    };

    const runRoute = async () => {
        const canvas = canvasRef.current;
    
        if (canvas) {
            setIsLoading(true);
            try {
                const response = await axios({
                    method: 'post',
                    url: `${import.meta.env.VITE_API_URL}/calculate`,
                    data: {
                        image: canvas.toDataURL('image/png'),
                        dict_of_vars: dictOfVars
                    }
                });

                const resp = await response.data;
                
                if (!resp.data || resp.data.length === 0) {
                    toast.warning('No expression detected', {
                        description: 'Please draw a clear mathematical expression and try again.',
                        duration: 4000,
                    });
                    return;
                }

                resp.data.forEach((data: Response) => {
                    if (data.assign === true) {
                        setDictOfVars(prev => ({
                            ...prev,
                            [data.expr]: data.result
                        }));
                    }
                });

                const ctx = canvas.getContext('2d');
                const imageData = ctx!.getImageData(0, 0, canvas.width, canvas.height);
                let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;

                for (let y = 0; y < canvas.height; y++) {
                    for (let x = 0; x < canvas.width; x++) {
                        const i = (y * canvas.width + x) * 4;
                        if (imageData.data[i + 3] > 0) {
                            minX = Math.min(minX, x);
                            minY = Math.min(minY, y);
                            maxX = Math.max(maxX, x);
                            maxY = Math.max(maxY, y);
                        }
                    }
                }

                const centerX = (minX + maxX) / 2;
                const centerY = (minY + maxY) / 2;

                setLatexPosition({ x: centerX, y: centerY });
                
                resp.data.forEach((data: Response) => {
                    setTimeout(() => {
                        setResult({
                            expression: data.expr,
                            answer: data.result
                        });
                    }, 1000);
                });

                toast.success('Success', {
                    description: 'Expression processed successfully!',
                    duration: 2000,
                });

            } catch (error) {
                handleAPIError(error);
            } finally {
                setIsLoading(false);
            }
        }
    };

    return (
        <div className="flex flex-col h-screen w-full">
            {isLoading && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
                    <div className="bg-white rounded-lg p-6 flex flex-col items-center space-y-4">
                        <Loader2 className="w-10 h-10 animate-spin text-black" />
                        <p className="text-black font-medium">Processing your expression...</p>
                    </div>
                </div>
            )}
            
            <div className="flex flex-col sm:flex-row justify-between items-center p-2 gap-2 z-20">
                <Button
                    onClick={() => setReset(true)}
                    className="w-full sm:w-auto bg-black text-white"
                    variant="default" 
                    color="black"
                    disabled={isLoading}
                >
                    Reset
                </Button>
                
                <div className="flex-grow flex justify-center overflow-x-auto py-2">
                    <Group className="z-20 flex-nowrap">
                        {SWATCHES.map((swatch) => (
                            <ColorSwatch 
                                key={swatch} 
                                color={swatch} 
                                onClick={() => !isLoading && setColor(swatch)}
                                style={{ 
                                    cursor: isLoading ? 'not-allowed' : 'pointer',
                                    minWidth: '24px',
                                    minHeight: '24px'
                                }}
                            />
                        ))}
                    </Group>
                </div>
                
                <Button
                    onClick={runRoute}
                    className="w-full sm:w-auto bg-black text-white"
                    variant="default"
                    color="white"
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <div className="flex items-center space-x-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Processing...</span>
                        </div>
                    ) : (
                        'Run'
                    )}
                </Button>
            </div>

            <div className="relative flex-grow">
                <canvas
                    ref={canvasRef}
                    className="absolute top-0 left-0 w-full h-full touch-none"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseOut={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    style={{ 
                        cursor: isLoading ? 'not-allowed' : 'crosshair',
                        opacity: isLoading ? 0.7 : 1 
                    }}
                />

                {latexExpression && latexExpression.map((latex, index) => (
                    <Draggable
                        key={index}
                        defaultPosition={latexPosition}
                        onStop={(e, data) => setLatexPosition({ x: data.x, y: data.y })}
                        disabled={isLoading}
                    >
                        <div className="absolute p-2 text-white rounded shadow-md">
                            <div className="latex-content">{latex}</div>
                        </div>
                    </Draggable>
                ))}
            </div>
        </div>
    );
}