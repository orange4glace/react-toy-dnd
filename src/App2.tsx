import './App.css';
import { useEffect, useState } from 'react';
import { Boxes, Box } from './step-by-step/boxes2';

function App() {
  const [boxes, setBoxes] = useState([
    {
      id: '0',
      x: 470,
      y: 350,
      width: 150,
      height: 150,
      color: 'DodgerBlue'
    }, {
      id: '1',
      x: 650,
      y: 470,
      width: 150,
      height: 200,
      color: 'MediumSeaGreen'
    }, {
      id: '2',
      x: 650,
      y: 290,
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
      <Boxes>
        {(renderProps) => (
          <>
            {boxes.map(box => (
              <Box key={box.id} id={box.id} {...renderProps}>
                {(provided, clicked) => (
                  <div {...provided} style={{
                    position: 'absolute',
                    left: `${box.x}px`,
                    top: `${box.y}px`,
                    width: `${box.width}px`,
                    height: `${box.height}px`,
                    background: `${box.color}`,
                    opacity: clicked ? '1' : '0.7',

                    userSelect: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                  }}>
                    <span>HELLO WORLD</span>
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

// function App() {
//   const [boxes, setBoxes] = useState([
//     {
//       id: '0',
//       x: 470,
//       y: 350,
//       width: 150,
//       height: 150,
//       color: 'DodgerBlue'
//     }, {
//       id: '1',
//       x: 650,
//       y: 470,
//       width: 150,
//       height: 200,
//       color: 'MediumSeaGreen'
//     }, {
//       id: '2',
//       x: 650,
//       y: 290,
//       width: 250,
//       height: 150,
//       color: 'MediumPurple'
//     }, 
//   ]);

//   function update(id: string, dx: number, dy: number) {
//     const nextBoxes = [...boxes];
//     const boxIdx = nextBoxes.findIndex(b => b.id === id);
//     nextBoxes[boxIdx].x += dx;
//     nextBoxes[boxIdx].y += dy;
//     setBoxes(nextBoxes);
//   }

//   return (
//     <div className="App">
//       <Boxes
//         onMove={(id: string, dx: number, dy: number) => console.log(`Move ${id}, x: ${dx}, y: ${dy}`)}
//         onMoveEnd={(id: string, dx: number, dy: number) => update(id, dx, dy)}>
//         {(renderProps) => (
//           <>
//             {boxes.map(box => (
//               <Box key={box.id} id={box.id} {...renderProps}>
//                 {(renderProps, clicked, offset, innerRef) => (
//                   <div ref={innerRef} style={{
//                     position: 'absolute',
//                     left: `${box.x + offset.x}px`,
//                     top: `${box.y + offset.y}px`,
//                     width: `${box.width}px`,
//                     height: `${box.height}px`,
//                     background: `${box.color}`,
//                     opacity: clicked ? '1' : '1',
//                   }} {...renderProps}>
//                   </div>
//                 )}
//               </Box>
//             ))}
//           </>
//         )}
//       </Boxes>
//     </div>
//   );
// }

export default App;
