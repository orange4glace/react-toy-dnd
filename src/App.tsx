import './App.css';
import { useState } from 'react';
import { Box, Boxes } from './boxes';

function App() {
  const [boxes, setBoxes] = useState([
    {
      id: '0',
      x: 50,
      y: 150,
      width: 150,
      height: 150,
      color: 'LightBlue'
    }, {
      id: '1',
      x: 150,
      y: 350,
      width: 150,
      height: 200,
      color: 'MediumSeaGreen'
    }, {
      id: '2',
      x: 550,
      y: 150,
      width: 250,
      height: 150,
      color: 'MediumPurple'
    }, 
  ]);

  function update(id: string, dx: number, dy: number) {
    const nextBoxes = [...boxes];
    const boxIdx = nextBoxes.findIndex(b => b.id === id);
    nextBoxes[boxIdx].x += dx;
    nextBoxes[boxIdx].y += dy;
    setBoxes(nextBoxes);
  }

  return (
    <div className="App">
      <Boxes
        onMove={(id: string, dx: number, dy: number) => console.log(`Move ${id}, x: ${dx}, y: ${dy}`)}
        onMoveEnd={(id: string, dx: number, dy: number) => update(id, dx, dy)}>
        {(renderProps) => (
          <>
            {boxes.map(box => (
              <Box key={box.id} id={box.id} {...renderProps}>
                {(renderProps, clicked, collided, offset, innerRef) => (
                  <div ref={innerRef} style={{
                    position: 'absolute',
                    left: `${box.x + offset.x}px`,
                    top: `${box.y + offset.y}px`,
                    width: `${box.width}px`,
                    height: `${box.height}px`,
                    background: collided ? 'crimson' : `${box.color}`,
                    opacity: clicked ? '.7' : '.3',
                  }} {...renderProps}>
                  </div>
                )}
              </Box>
            ))}
          </>
        )}
      </Boxes>
    </div>
  );
}

export default App;
